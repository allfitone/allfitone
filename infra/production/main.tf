/**
 * The production environment. There is only one environment, so there is one
 * root module; adding another later means copying this directory with its own
 * state key, not branching inside it.
 */

terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Bucket and key come from backend.hcl so the account id stays out of code.
  backend "s3" {
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  # Refuses to run against any other account, whatever profile is active.
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = { Project = "allfitone", Environment = "production", ManagedBy = "terraform" }
  }
}

module "budget" {
  source = "../modules/budget"

  name             = "allfitone"
  monthly_limit    = var.budget_monthly_limit
  alert_thresholds = var.budget_alert_thresholds
  emails           = var.budget_alert_emails
}

module "network" {
  source = "../modules/network"

  name       = "allfitone-production"
  cidr_block = "10.20.0.0/16"
}

module "github_oidc" {
  source = "../modules/github-oidc"
}

# One secret per environment holds every credential: database and app alike.
resource "aws_secretsmanager_secret" "environment" {
  name                    = "allfitone/production"
  description             = "Every credential of the production environment, as one JSON object"
  recovery_window_in_days = 30
}

# Exists only during the apply; RDS and the secret receive it write-only.
ephemeral "aws_secretsmanager_random_password" "database_master" {
  password_length     = 40
  exclude_punctuation = true
}

module "database" {
  source = "../modules/database"

  name               = "allfitone-production"
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids

  environment_secret_id = aws_secretsmanager_secret.environment.arn
  master_password       = ephemeral.aws_secretsmanager_random_password.database_master.random_password

  # Nothing reaches the database yet; ECS joins this map in phase 3.
  client_security_group_ids = {}
}

