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
