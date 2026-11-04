/**
 * The TLS certificate for every public name, issued by ACM in us-east-1, the
 * only region CloudFront reads certificates from, so the load balancer and the
 * distributions share it.
 *
 * DNS lives in GoDaddy, out of Terraform's reach: the validation records come
 * out as an output and are created there by hand. They stay there for good,
 * because ACM renews against the same records.
 */

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "domain_names" {
  description = "Every name served; the first is the subject."
  type        = list(string)
}

resource "aws_acm_certificate" "this" {
  domain_name               = var.domain_names[0]
  subject_alternative_names = var.domain_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

output "arn" {
  value = aws_acm_certificate.this.arn
}

output "validation_records" {
  description = "CNAMEs to create in GoDaddy, one per name."
  value = {
    for option in aws_acm_certificate.this.domain_validation_options : option.domain_name => {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  }
}
