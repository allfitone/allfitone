output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}

output "database_address" {
  value = module.database.address
}

output "environment_secret_arn" {
  value = aws_secretsmanager_secret.environment.arn
}

output "github_oidc_provider_arn" {
  value = module.github_oidc.provider_arn
}

output "repository_urls" {
  value = module.registry.repository_urls
}

output "certificate_validation_records" {
  description = "CNAMEs to create in GoDaddy before the certificate can be used."
  value       = module.certificate.validation_records
}

output "load_balancer_dns_name" {
  value = module.edge.load_balancer_dns_name
}

output "distribution_domain_names" {
  value = module.edge.distribution_domain_names
}

output "cluster_name" {
  value = module.compute.cluster_name
}

output "deploy_role_arn" {
  description = "AWS_DEPLOY_ROLE_ARN in the Production GitHub environment."
  value       = module.deploy_role.role_arn
}
