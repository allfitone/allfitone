mock_provider "aws" {
  mock_data "aws_region" {
    defaults = {
      region = "us-east-1"
    }
  }
}

variables {
  name           = "allfitone"
  domain         = "allfit.one"
  sender_address = "invites@allfit.one"
  alert_emails   = ["admin@example.com", "ops@example.com"]
}

run "the_domain_sends_through_its_own_set" {
  command = plan

  assert {
    condition     = aws_sesv2_email_identity.domain.email_identity == "allfit.one"
    error_message = "The identity is the domain, so any address on it can send."
  }

  assert {
    condition     = aws_sesv2_email_identity.domain.configuration_set_name == "allfitone"
    error_message = "Every email must go through the set that carries the suppression and reputation settings."
  }
}

run "bounces_return_to_a_subdomain_that_is_not_resends" {
  command = plan

  assert {
    condition     = aws_sesv2_email_identity_mail_from_attributes.domain.mail_from_domain == "mail.allfit.one"
    error_message = "MAIL FROM must be a subdomain of allfit.one so SPF aligns, and not send, which Resend holds."
  }

  assert {
    condition     = aws_sesv2_email_identity_mail_from_attributes.domain.behavior_on_mx_failure == "USE_DEFAULT_VALUE"
    error_message = "A missing MX must not stop email; DKIM alone keeps DMARC passing."
  }
}

run "a_bounce_or_a_complaint_stops_further_sending" {
  command = plan

  assert {
    condition     = toset(aws_sesv2_account_suppression_attributes.this.suppressed_reasons) == toset(["BOUNCE", "COMPLAINT"])
    error_message = "The account must suppress addresses that bounced and addresses that complained."
  }

  assert {
    condition     = toset(aws_sesv2_configuration_set.this.suppression_options[0].suppressed_reasons) == toset(["BOUNCE", "COMPLAINT"])
    error_message = "The set must not narrow the account's suppression."
  }
}

run "nobody_is_tracked_opening_an_email" {
  command = plan

  assert {
    condition     = length(aws_sesv2_configuration_set.this.tracking_options) == 0
    error_message = "Open and click tracking would route private links through Amazon; the privacy policy does not cover it."
  }

  assert {
    condition     = aws_sesv2_configuration_set.this.vdm_options[0].dashboard_options[0].engagement_metrics == "DISABLED"
    error_message = "The set must not collect engagement metrics."
  }

  assert {
    condition     = aws_sesv2_account_vdm_attributes.this.dashboard_attributes[0].engagement_metrics == "DISABLED"
    error_message = "The account must not collect engagement metrics."
  }
}

run "the_alarms_fire_before_aws_reviews_the_account" {
  command = plan

  assert {
    condition     = aws_cloudwatch_metric_alarm.bounce_rate.metric_name == "Reputation.BounceRate" && aws_cloudwatch_metric_alarm.bounce_rate.threshold < 0.05
    error_message = "The bounce alarm must watch the account's bounce rate and fire below 5%."
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.complaint_rate.metric_name == "Reputation.ComplaintRate" && aws_cloudwatch_metric_alarm.complaint_rate.threshold < 0.001
    error_message = "The complaint alarm must watch the account's complaint rate and fire below 0.1%."
  }

  assert {
    condition     = length(aws_sns_topic_subscription.alerts) == 2
    error_message = "Every alert address must be subscribed."
  }
}

run "an_alarm_cannot_be_set_where_aws_already_acts" {
  command = plan

  variables {
    bounce_rate_threshold = 0.05
  }

  expect_failures = [var.bounce_rate_threshold]
}

run "the_records_for_godaddy_include_mail_from" {
  command = plan

  assert {
    condition     = contains([for r in output.dns_records : "${r.type} ${r.name} ${r.value}"], "MX mail.allfit.one 10 feedback-smtp.us-east-1.amazonses.com")
    error_message = "The MX of mail.allfit.one must point to SES's feedback endpoint in the identity's region."
  }

  assert {
    condition     = contains([for r in output.dns_records : "${r.type} ${r.name} ${r.value}"], "TXT mail.allfit.one v=spf1 include:amazonses.com ~all")
    error_message = "The SPF of mail.allfit.one must allow SES."
  }
}

# ADR-049, scenario 4: the role that sends can send from one address, on one identity.
run "the_app_sends_only_from_its_sender_through_its_identity" {
  command = plan

  override_resource {
    target = aws_sesv2_email_identity.domain
    # The ARNs are computed; without this they stay unknown in a plan.
    override_during = plan
    values          = { arn = "arn:aws:ses:us-east-1:000000000000:identity/allfit.one" }
  }

  override_resource {
    target          = aws_sesv2_configuration_set.this
    override_during = plan
    values          = { arn = "arn:aws:ses:us-east-1:000000000000:configuration-set/allfitone" }
  }

  assert {
    condition     = length(jsondecode(output.send_policy).Statement) == 1
    error_message = "The send policy must hold one statement and nothing more."
  }

  assert {
    condition     = jsondecode(output.send_policy).Statement[0].Effect == "Allow" && jsondecode(output.send_policy).Statement[0].Action == "ses:SendEmail"
    error_message = "The role may send email and do nothing else in SES."
  }

  assert {
    condition = toset(jsondecode(output.send_policy).Statement[0].Resource) == toset([
      "arn:aws:ses:us-east-1:000000000000:identity/allfit.one",
      "arn:aws:ses:us-east-1:000000000000:configuration-set/allfitone",
    ])
    error_message = "The role may send only through the allfit.one identity and its set, never another domain."
  }

  assert {
    condition     = jsondecode(output.send_policy).Statement[0].Condition == { StringEquals = { "ses:FromAddress" = "invites@allfit.one" } }
    error_message = "The role may send only from the sender address."
  }
}

run "a_sender_outside_the_domain_is_refused" {
  command = plan

  variables {
    sender_address = "invites@allfit.one.example.com"
  }

  expect_failures = [var.sender_address]
}

run "a_sender_with_two_addresses_is_refused" {
  command = plan

  variables {
    sender_address = "someone@example.com@allfit.one"
  }

  expect_failures = [var.sender_address]
}
