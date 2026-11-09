/**
 * Amazon SES for every email Allfit One sends (ADR-049): the domain identity,
 * the configuration set it sends through, the account's suppression and
 * deliverability settings, and the alarms on its reputation.
 *
 * The identity was created by hand in the SES console on 9 November 2026, and
 * production access was granted the same day. Production imports the identity
 * instead of creating it: a new one would get new DKIM tokens, and the three
 * CNAMEs already published in GoDaddy would stop matching.
 *
 * DNS lives in GoDaddy, out of Terraform's reach: the DKIM and MAIL FROM
 * records come out as an output and are kept there by hand.
 *
 * Open and click tracking is deliberately absent. It would route every link,
 * the waitlist's private tokens included, through an Amazon tracking domain,
 * and the privacy policy does not cover measuring who opens an email.
 */

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

data "aws_region" "current" {}

locals {
  mail_from_domain = "${var.mail_from_subdomain}.${var.domain}"
}

resource "aws_sesv2_configuration_set" "this" {
  configuration_set_name = var.name

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }

  vdm_options {
    dashboard_options {
      engagement_metrics = "DISABLED"
    }

    guardian_options {
      optimized_shared_delivery = "ENABLED"
    }
  }
}

resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.domain

  # Every email goes through this set unless the sender names another.
  configuration_set_name = aws_sesv2_configuration_set.this.configuration_set_name

  # Replacing the identity would rotate its DKIM tokens and break the records in GoDaddy.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity   = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain = local.mail_from_domain

  # If the MX goes missing, mail still leaves through amazonses.com; DKIM keeps DMARC passing.
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

# Account-wide: SES stops sending to an address that bounced or complained, whatever the set.
resource "aws_sesv2_account_suppression_attributes" "this" {
  suppressed_reasons = ["BOUNCE", "COMPLAINT"]
}

resource "aws_sesv2_account_vdm_attributes" "this" {
  vdm_enabled = "ENABLED"

  dashboard_attributes {
    engagement_metrics = "DISABLED"
  }

  guardian_attributes {
    optimized_shared_delivery = "ENABLED"
  }
}

resource "aws_sns_topic" "alerts" {
  name = "${var.name}-email-alerts"
}

resource "aws_sns_topic_subscription" "alerts" {
  for_each = toset(var.alert_emails)

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

# SES publishes both rates for the whole account, with no dimensions, on its own.
resource "aws_cloudwatch_metric_alarm" "bounce_rate" {
  alarm_name          = "${var.name}-email-bounce-rate"
  alarm_description   = "SES bounce rate above ${var.bounce_rate_threshold * 100}%. AWS reviews the account at 5% (ADR-049)."
  namespace           = "AWS/SES"
  metric_name         = "Reputation.BounceRate"
  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = var.bounce_rate_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "complaint_rate" {
  alarm_name          = "${var.name}-email-complaint-rate"
  alarm_description   = "SES complaint rate above ${var.complaint_rate_threshold * 100}%. AWS reviews the account at 0.1% (ADR-049)."
  namespace           = "AWS/SES"
  metric_name         = "Reputation.ComplaintRate"
  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = var.complaint_rate_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

output "identity_arn" {
  description = "The identity the worker's task role may send from."
  value       = aws_sesv2_email_identity.domain.arn
}

output "configuration_set_name" {
  value = aws_sesv2_configuration_set.this.configuration_set_name
}

output "dns_records" {
  description = "Records to keep in GoDaddy: three DKIM CNAMEs, then the MAIL FROM MX and SPF."
  value = concat(
    [
      for token in try(aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens, []) : {
        type  = "CNAME"
        name  = "${token}._domainkey.${var.domain}"
        value = "${token}.dkim.amazonses.com"
      }
    ],
    [
      {
        type  = "MX"
        name  = local.mail_from_domain
        value = "10 feedback-smtp.${data.aws_region.current.region}.amazonses.com"
      },
      {
        type  = "TXT"
        name  = local.mail_from_domain
        value = "v=spf1 include:amazonses.com ~all"
      },
    ],
  )
}
