variable "name" {
  description = "Prefix for the configuration set, the alerts topic and the alarms."
  type        = string
}

variable "domain" {
  description = "The domain every email is sent from."
  type        = string
}

variable "mail_from_subdomain" {
  description = "Subdomain bounces return to, so SPF aligns with the domain. Not `send`, which Resend holds."
  type        = string
  default     = "mail"
}

variable "alert_emails" {
  description = "Who hears when the bounce or complaint rate climbs. Each address confirms its subscription once."
  type        = list(string)
}

# AWS reviews an account at a 5% bounce rate and a 0.1% complaint rate. The
# alarms fire well before, while there is still time to find the cause.
variable "bounce_rate_threshold" {
  description = "Bounce rate, as a fraction, that sets off the alarm."
  type        = number
  default     = 0.02

  validation {
    condition     = var.bounce_rate_threshold > 0 && var.bounce_rate_threshold < 0.05
    error_message = "The bounce alarm must fire below the 5% at which AWS reviews the account."
  }
}

variable "complaint_rate_threshold" {
  description = "Complaint rate, as a fraction, that sets off the alarm."
  type        = number
  default     = 0.0005

  validation {
    condition     = var.complaint_rate_threshold > 0 && var.complaint_rate_threshold < 0.001
    error_message = "The complaint alarm must fire below the 0.1% at which AWS reviews the account."
  }
}
