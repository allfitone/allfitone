/**
 * The role GitHub Actions assumes to ship a release: push images, register the
 * next task definition revision, roll the services and run the migrator.
 *
 * Only jobs in one GitHub environment of one repository can assume it, and that
 * environment only accepts `main`. There is no access key anywhere: the token
 * lives for the length of the job.
 *
 * Every action is named. Where AWS offers no resource-level control
 * (GetAuthorizationToken, Register/DescribeTaskDefinition) the resource is "*",
 * and that is the whole list of exceptions.
 */

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

locals {
  issuer      = "token.actions.githubusercontent.com"
  cluster_arn = "arn:aws:ecs:${var.region}:${var.account_id}:cluster/${var.cluster_name}"
}

resource "aws_iam_role" "this" {
  name                 = var.name
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.issuer}:aud" = "sts.amazonaws.com"
          "${local.issuer}:sub" = "repo:${var.github_repository}:environment:${var.github_environment}"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "deploy"
  role = aws_iam_role.this.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "RegistryLogin"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "PushImages"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:BatchGetImage",
          "ecr:DescribeImages",
        ]
        Resource = var.ecr_repository_arns
      },
      {
        Sid      = "TaskDefinitions"
        Effect   = "Allow"
        Action   = ["ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition"]
        Resource = "*"
      },
      {
        Sid      = "RollServices"
        Effect   = "Allow"
        Action   = ["ecs:UpdateService", "ecs:DescribeServices"]
        Resource = "arn:aws:ecs:${var.region}:${var.account_id}:service/${var.cluster_name}/*"
      },
      {
        Sid       = "RunMigrator"
        Effect    = "Allow"
        Action    = "ecs:RunTask"
        Resource  = "arn:aws:ecs:${var.region}:${var.account_id}:task-definition/${var.migrator_family}:*"
        Condition = { ArnEquals = { "ecs:cluster" = local.cluster_arn } }
      },
      {
        Sid      = "WatchMigrator"
        Effect   = "Allow"
        Action   = "ecs:DescribeTasks"
        Resource = "arn:aws:ecs:${var.region}:${var.account_id}:task/${var.cluster_name}/*"
      },
      {
        Sid       = "HandTaskRolesToEcs"
        Effect    = "Allow"
        Action    = "iam:PassRole"
        Resource  = var.pass_role_arns
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      },
      {
        Sid      = "RecordReleasedTag"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:PutParameter"]
        Resource = "arn:aws:ssm:${var.region}:${var.account_id}:parameter${var.image_tag_parameter}"
      },
      {
        Sid      = "ReadMigratorLogs"
        Effect   = "Allow"
        Action   = "logs:GetLogEvents"
        Resource = "arn:aws:logs:${var.region}:${var.account_id}:log-group:${var.migrator_log_group}:log-stream:*"
      },
    ]
  })
}
