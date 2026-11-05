variable "name" {
  description = "Cluster name and prefix of its companions."
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Public subnets: machines reach ECR and the internet without NAT."
  type        = list(string)
}

variable "load_balancer_security_group_id" {
  description = "The only group allowed to reach the containers."
  type        = string
}

variable "instance_count" {
  description = "Machines in the cluster. Fixed: min, max and desired are all this."
  type        = number
  default     = 1

  validation {
    condition     = var.instance_count >= 1
    error_message = "The cluster needs at least one machine."
  }
}

variable "on_demand_base_capacity" {
  description = "Machines bought on demand; every one above this is spot."
  type        = number
  default     = 0
}

variable "instance_types" {
  description = "Graviton types the spot request may choose from, in order of preference."
  type        = list(string)
  default     = ["t4g.medium", "t4g.large", "m7g.medium"]
}

variable "root_volume_gb" {
  description = "Holds the OS and the pulled images."
  type        = number
  default     = 30
}
