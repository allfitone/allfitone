variable "name" {
  description = "Prefix of roles and log groups."
  type        = string
}

variable "region" {
  type = string
}

variable "cluster_arn" {
  type = string
}

variable "capacity_provider_name" {
  type = string
}

variable "secret_arn" {
  description = "The environment's single secret; every credential is one of its JSON keys."
  type        = string
}

variable "repository_urls" {
  description = "Image name without tag, per service or task."
  type        = map(string)
}

variable "image_tag" {
  description = "The commit SHA every image was built from."
  type        = string
}

variable "target_group_arns" {
  description = "Load balancer target group per service that takes traffic."
  type        = map(string)
}

variable "services" {
  description = "Long-lived services. A null port means no traffic and no target group."
  type = map(object({
    port               = number
    memory_reservation = number
    memory             = number
    desired_count      = number
    single_instance    = bool
    secret_keys        = list(string)
    environment        = map(string)
    health_command     = string
    # IAM policy JSON for what the app itself may call in AWS; null means no role at all.
    task_role_policy = optional(string)
  }))
}

variable "tasks" {
  description = "Task definitions run on demand with `aws ecs run-task`, such as the migrator."
  type = map(object({
    memory_reservation = number
    memory             = number
    secret_keys        = list(string)
    environment        = map(string)
  }))
  default = {}
}

variable "log_retention_days" {
  type    = number
  default = 14
}
