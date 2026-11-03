variable "name" {
  description = "Identifier of the instance and prefix of its companions."
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  description = "Subnets with no route out, one per zone. RDS asks for two zones even for a single instance."
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "An RDS subnet group needs subnets in at least two zones."
  }
}

variable "client_security_group_ids" {
  description = "Who may open a connection, as name => security group id. Keys must be static."
  type        = map(string)
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "allocated_storage_gb" {
  type    = number
  default = 20
}

variable "max_allocated_storage_gb" {
  description = "Storage grows on its own up to this size."
  type        = number
  default     = 100
}

variable "multi_az" {
  description = "Keep a standby in a second zone. Doubles the instance and storage cost."
  type        = bool
  default     = false
}

variable "environment_secret_id" {
  description = "The environment's single Secrets Manager secret; database credentials are written into it."
  type        = string
}

variable "master_password" {
  description = "Write-only master password. Ephemeral: Terraform never stores it."
  type        = string
  ephemeral   = true
  sensitive   = true
}
