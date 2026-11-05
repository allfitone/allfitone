variable "name" {
  type = string
}

variable "oidc_provider_arn" {
  description = "The GitHub OIDC provider created by the github-oidc module."
  type        = string
}

variable "github_repository" {
  description = "Repository as it appears in the OIDC subject: owner/name, or owner@id/name@id when immutable."
  type        = string
}

variable "github_environment" {
  description = "GitHub environment the job must run in; it restricts deploys to main."
  type        = string
}

variable "region" {
  type = string
}

variable "account_id" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "migrator_family" {
  type = string
}

variable "pass_role_arns" {
  description = "Roles a registered task definition may name; nothing else can be passed."
  type        = list(string)
}

variable "ecr_repository_arns" {
  type = list(string)
}

variable "image_tag_parameter" {
  description = "SSM parameter name holding the released commit SHA, starting with /."
  type        = string
}

variable "migrator_log_group" {
  type = string
}
