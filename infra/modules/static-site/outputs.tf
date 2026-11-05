output "bucket" {
  description = "Goes into the repository's Production environment as SITE_BUCKET."
  value       = aws_s3_bucket.this.id
}

output "distribution_id" {
  description = "Goes into the repository's Production environment as SITE_DISTRIBUTION_ID."
  value       = aws_cloudfront_distribution.this.id
}

output "domain_name" {
  description = "The CNAME target for the host."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "deploy_role_arn" {
  description = "Goes into the repository's Production environment as AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.deploy.arn
}
