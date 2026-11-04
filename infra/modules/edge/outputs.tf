output "load_balancer_dns_name" {
  value = aws_lb.this.dns_name
}

output "load_balancer_security_group_id" {
  value = aws_security_group.load_balancer.id
}

output "target_group_arns" {
  value = { for key, tg in aws_lb_target_group.app : key => tg.arn }
}

output "distribution_domain_names" {
  description = "Where each web host's CNAME will point at cutover."
  value       = { for key, d in aws_cloudfront_distribution.web : key => d.domain_name }
}
