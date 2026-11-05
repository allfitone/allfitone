output "role_arn" {
  description = "Goes into the Production GitHub environment as AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.this.arn
}
