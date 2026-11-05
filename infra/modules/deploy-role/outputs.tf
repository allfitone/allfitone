output "role_arn" {
  description = "Goes into the aws-production GitHub environment as AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.this.arn
}
