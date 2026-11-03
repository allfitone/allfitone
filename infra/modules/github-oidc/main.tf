/**
 * Lets GitHub Actions obtain short-lived AWS credentials, so no access key is
 * ever stored as a repository secret. The roles that trust this provider are
 * created with the deployment pipeline, scoped to this repository and branch.
 */

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

output "provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}
