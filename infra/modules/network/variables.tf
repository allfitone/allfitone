variable "name" {
  description = "Prefix for every resource name in this network."
  type        = string
}

variable "cidr_block" {
  description = "Address range of the VPC. Subnets are /24 slices of it."
  type        = string

  validation {
    condition     = can(cidrnetmask(var.cidr_block)) && tonumber(split("/", var.cidr_block)[1]) <= 16
    error_message = "Use a /16 or larger so each tier gets room to grow."
  }
}
