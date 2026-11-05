output "repository_urls" {
  description = "Image name without tag, per repository."
  value       = { for key, repo in aws_ecr_repository.this : key => repo.repository_url }
}

output "repository_arns" {
  value = { for key, repo in aws_ecr_repository.this : key => repo.arn }
}
