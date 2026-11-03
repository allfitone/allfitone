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
