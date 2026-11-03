variable "account_id" {
  description = "The only AWS account this stack may touch."
  type        = string
  default     = "788208946198"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "budget_monthly_limit" {
  description = "Expected monthly ceiling in USD, before credits."
  type        = number
  default     = 150
}

variable "budget_alert_thresholds" {
  description = "Actual monthly spend in USD that sends an alert at each step."
  type        = list(number)
  default     = [100, 150]
}

variable "budget_alert_emails" {
  description = "Who hears about the bill. Set it in terraform.tfvars, which is not committed."
  type        = list(string)
}
