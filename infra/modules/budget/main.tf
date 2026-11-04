/**
 * Monthly cost budget with e-mail alerts.
 *
 * Credits are excluded on purpose: while they last, a budget that counts them
 * reads zero and never fires, and the first signal would be the bill after
 * they run out.
 */

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_limit)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit = false
    include_refund = false
  }

  dynamic "notification" {
    for_each = toset(var.alert_thresholds)

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "ABSOLUTE_VALUE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.emails
    }
  }

  # Warns before the month closes, while there is still time to react.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.monthly_limit
    threshold_type             = "ABSOLUTE_VALUE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.emails
  }
}
