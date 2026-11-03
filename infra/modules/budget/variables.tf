variable "name" {
  description = "Prefix for the budget name."
  type        = string
}

variable "monthly_limit" {
  description = "Monthly spend in USD that the forecast alert compares against."
  type        = number
}

variable "alert_thresholds" {
  description = "Actual monthly spend amounts in USD that each send an alert."
  type        = list(number)
}

variable "emails" {
  description = "Recipients of every alert. Kept out of the repository; set it in a local tfvars file."
  type        = list(string)

  validation {
    condition     = length(var.emails) > 0
    error_message = "A budget nobody hears about protects nothing. Give at least one recipient."
  }
}
