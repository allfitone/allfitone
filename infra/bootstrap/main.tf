/**
 * The bucket that holds every other Terraform state.
 *
 * It cannot store its own state before it exists. From scratch: comment out the
 * backend block, apply with local state, restore the block and migrate:
 *
 *   terraform init && terraform apply
 *   terraform init -migrate-state -backend-config=backend.hcl
 *
 * Already done for this account; normal runs only need the second init.
 *
 * Versioning is what makes a corrupted or overwritten state recoverable.
 */

terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Comment out for a first apply in a new account; see the steps above.
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
    tags = { Project = "allfitone", ManagedBy = "terraform", Stack = "bootstrap" }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "state" {
  bucket = "allfitone-terraform-state-${data.aws_caller_identity.current.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "tls_only" {
  bucket = aws_s3_bucket.state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# Old state versions are only for recovery; ninety days is plenty.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "account_id" {
  description = "The only AWS account this stack may touch."
  type        = string
  default     = "788208946198"
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}
