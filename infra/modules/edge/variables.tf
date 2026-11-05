variable "name" {
  description = "Load balancer name and prefix of its target groups (32 characters at most each)."
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Public subnets in at least two zones; an ALB requires two."
  type        = list(string)
}

variable "instance_security_group_id" {
  description = "The ECS machines; the only destination of the load balancer."
  type        = string
}

variable "certificate_arn" {
  description = "Validated ACM certificate for every host, in us-east-1."
  type        = string
}

variable "origin_verify_secret" {
  description = "Header value CloudFront adds and the load balancer requires for the webs."
  type        = string
  sensitive   = true
}

variable "apps" {
  description = "What the load balancer serves, per app."
  type = map(object({
    hosts        = list(string)
    port         = number
    health_path  = string
    behind_cdn   = bool
    rule_ordinal = number
  }))
}
