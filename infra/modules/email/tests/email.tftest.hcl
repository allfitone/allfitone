mock_provider "aws" {
  mock_data "aws_region" {
    defaults = {
      region = "us-east-1"
    }
  }
}

variables {
  name         = "allfitone"
  domain       = "allfit.one"
  alert_emails = ["admin@example.com", "ops@example.com"]
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
