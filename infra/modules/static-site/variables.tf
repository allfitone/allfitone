variable "name" {
  description = "Bucket name and prefix of the site's companions."
  type        = string
}

variable "host" {
  description = "The one hostname the distribution answers for."
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate in us-east-1 that covers the host."
  type        = string
}

variable "redirects" {
  description = "Exact path to {location, status}, answered at the edge."
  type = map(object({
    location = string
    status   = number
  }))
  default = {}
}

variable "oidc_provider_arn" {
  description = "The GitHub OIDC provider created by the github-oidc module."
  type        = string
}

variable "github_repository" {
  description = "Repository as it appears in the OIDC subject: owner@id/name@id."
  type        = string
}

variable "github_environment" {
  description = "GitHub environment the deploy job runs in; it restricts deploys to main."
  type        = string
  default     = "Production"
}
