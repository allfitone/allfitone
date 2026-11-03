mock_provider "aws" {}

variables {
  name             = "allfit-test"
  monthly_limit    = 150
  alert_thresholds = [100, 150]
  emails           = ["alerts@example.com"]
}

run "alerts_at_each_threshold" {
  command = plan

  assert {
    condition     = length(aws_budgets_budget.monthly.notification) == 3
    error_message = "Expected one actual-spend alert per threshold plus one forecast alert."
  }

  assert {
    condition = toset([
      for n in aws_budgets_budget.monthly.notification : n.threshold if n.notification_type == "ACTUAL"
    ]) == toset([100, 150])
    error_message = "Actual-spend alerts must fire at every configured amount."
  }
}

run "counts_real_spend_not_credits" {
  command = plan

  assert {
    condition     = aws_budgets_budget.monthly.cost_types[0].include_credit == false
    error_message = "Credits must be excluded, or the budget would read zero while they last."
  }
}

run "rejects_an_empty_recipient_list" {
  command = plan

  variables {
    emails = []
  }

  expect_failures = [var.emails]
}
