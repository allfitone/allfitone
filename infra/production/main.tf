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

  client_security_group_ids = { ecs = module.compute.instance_security_group_id }
}

# --- Phase 3: where the apps run and how traffic reaches them --------------------

locals {
  # What reads which key of the environment secret. A key missing from the secret
  # keeps that container from starting; an optional value is stored as "".
  shared_secret_keys = [
    "DATABASE_URL",
    "WORKOS_ISSUER", "WORKOS_WEBHOOK_SECRET",
    "WORKOS_CLIENT_ID_SPACE", "WORKOS_CLIENT_ID_STUDIO", "WORKOS_CLIENT_ID_BACKOFFICE",
    "WORKOS_API_KEY_SPACE", "WORKOS_API_KEY_STUDIO", "WORKOS_API_KEY_BACKOFFICE",
    "ANALYTICS_SERVER_ENABLED", "ANALYTICS_SPACE_CLIENT_ENABLED",
    "ANALYTICS_STUDIO_CLIENT_ENABLED", "ANALYTICS_BACKOFFICE_CLIENT_ENABLED",
    "ANALYTICS_PSEUDONYM_ACTIVE_VERSION", "ANALYTICS_PSEUDONYM_KEY_V1",
    "POSTHOG_HOST", "POSTHOG_SERVER_API_KEY",
    "INVITATION_TOKEN_ACTIVE_VERSION", "INVITATION_TOKEN_KEY_V1",
    "CATALOG_MEDIA_BASE_URL",
  ]

  api_secret_keys = concat(local.shared_secret_keys, [
    "API_PUBLIC_URL", "STUDIO_WEB_URL", "BACKOFFICE_WEB_URL",
    "SESSION_ENCRYPTION_KEY", "BACKOFFICE_AUTH_ENABLED",
    "CLIENT_INVITATION_ISSUANCE_ENABLED", "STAFF_INVITATION_ISSUANCE_ENABLED",
    "AI_GATEWAY_API_KEY", "FOOD_RECOGNITION_MODEL",
    "OBJECT_STORE_BUCKET", "OBJECT_STORE_REGION", "OBJECT_STORE_ENDPOINT",
    "OBJECT_STORE_ACCESS_KEY_ID", "OBJECT_STORE_SECRET_ACCESS_KEY", "OBJECT_STORE_KMS_KEY_ID",
    "APPLE_APP_APPLE_ID", "APPLE_BUNDLE_ID", "APPLE_ENVIRONMENT",
    "GOOGLE_PLAY_PACKAGE_NAME", "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
    "GOOGLE_PUBSUB_AUDIENCE", "GOOGLE_PUBSUB_SERVICE_ACCOUNT",
  ])

  # The one address the app sends from; the worker's role can use no other.
  # It has a mailbox in Google Workspace, so a reply reaches someone.
  email_sender = "hello@allfit.one"

  # RESEND_API_KEY stays until SES has carried production email for two weeks (ADR-049).
  # The store keys are the API's: the worker removes the photos the API could not (HU-BO-033).
  worker_secret_keys = concat(local.shared_secret_keys, [
    "CRON_SECRET", "RESEND_API_KEY",
    "STAFF_INVITATION_DELIVERY_ENABLED", "STAFF_INVITATION_PUBLIC_BASE_URL",
    "CLIENT_INVITATION_DELIVERY_ENABLED", "ACCOUNT_RECOVERY_DELIVERY_ENABLED",
    "OBJECT_STORE_BUCKET", "OBJECT_STORE_REGION", "OBJECT_STORE_ENDPOINT",
    "OBJECT_STORE_ACCESS_KEY_ID", "OBJECT_STORE_SECRET_ACCESS_KEY", "OBJECT_STORE_KMS_KEY_ID",
  ])

  # Above the load balancer's 60 s idle timeout, so the app never closes a
  # connection the load balancer is about to reuse.
  web_environment = { PORT = "3000", KEEP_ALIVE_TIMEOUT = "65000" }

  # Hosts per app. `rule_ordinal` is the listener rule priority.
  routes = {
    api            = { hosts = ["api.allfit.one"], port = 8080, health_path = "/health", behind_cdn = false, rule_ordinal = 10 }
    studio-web     = { hosts = ["studio.allfit.one"], port = 3000, health_path = "/", behind_cdn = true, rule_ordinal = 20 }
    backoffice-web = { hosts = ["backoffice.allfit.one"], port = 3000, health_path = "/", behind_cdn = true, rule_ordinal = 30 }
    space-web      = { hosts = ["space.allfit.one"], port = 3000, health_path = "/es", behind_cdn = true, rule_ordinal = 40 }
  }

  web_service = {
    port               = 3000
    memory_reservation = 384
    memory             = 512
    desired_count      = var.service_desired_count
    single_instance    = false
    secret_keys        = []
    environment        = local.web_environment
    health_command     = null
  }
}

module "registry" {
  source = "../modules/registry"

  name         = "allfitone"
  repositories = ["api", "worker", "studio-web", "backoffice-web", "space-web", "migrator"]
}

module "compute" {
  source = "../modules/compute"

  name                            = "allfitone-production"
  vpc_id                          = module.network.vpc_id
  subnet_ids                      = module.network.public_subnet_ids
  load_balancer_security_group_id = module.edge.load_balancer_security_group_id
  instance_count                  = var.instance_count
  on_demand_base_capacity         = var.on_demand_base_capacity

  # Three types scored 1/10 for spot capacity in our zones; these five score 9.
  # All Graviton with 2 vCPU and 4 GB or more, so capacity does not depend on the draw.
  instance_types = ["t4g.medium", "t4g.large", "c6g.large", "c7g.large", "c8g.large"]
}

module "certificate" {
  source = "../modules/certificate"

  # Wildcard on purpose: CAA for *.X is checked at X, not at each host's CNAME target.
  domain_names = ["*.allfit.one"]
}

# Waits until the CNAMEs exist in GoDaddy and ACM has issued the certificate.
resource "aws_acm_certificate_validation" "this" {
  certificate_arn = module.certificate.arn
}

# Every email Allfit One sends leaves through SES (ADR-049).
module "email" {
  source = "../modules/email"

  name           = "allfitone"
  domain         = "allfit.one"
  sender_address = local.email_sender
  # The people who watch the bill also hear when email reputation slips.
  alert_emails = var.budget_alert_emails
}

# Created by hand in the SES console on 9 November 2026. Importing keeps its
# DKIM tokens, which are already published in GoDaddy.
import {
  to = module.email.aws_sesv2_email_identity.domain
  id = "allfit.one"
}

import {
  to = module.email.aws_sesv2_email_identity_mail_from_attributes.domain
  id = "allfit.one"
}

module "edge" {
  source = "../modules/edge"

  name                       = "allfitone"
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.public_subnet_ids
  instance_security_group_id = module.compute.instance_security_group_id
  certificate_arn            = aws_acm_certificate_validation.this.certificate_arn
  origin_verify_secret       = var.origin_verify_secret
  backoffice_origin          = "https://${local.routes["backoffice-web"].hosts[0]}"
  apps                       = local.routes
}

# The commit SHA the services run. The pipeline writes it on every release; Terraform
# only creates it, then reads it back so an apply never rolls a service onto an old image.
resource "aws_ssm_parameter" "image_tag" {
  name = "/allfitone/production/image-tag"
  type = "String"
  # A commit SHA is not a secret; `value` would mark every task definition sensitive.
  insecure_value = "992c0792b64f3f2d767434778109773740e950e7"

  lifecycle {
    ignore_changes = [insecure_value]
  }
}

module "services" {
  source = "../modules/services"

  name                   = "allfitone-production"
  region                 = var.region
  cluster_arn            = module.compute.cluster_arn
  capacity_provider_name = module.compute.capacity_provider_name
  secret_arn             = aws_secretsmanager_secret.environment.arn
  repository_urls        = module.registry.repository_urls
  image_tag              = aws_ssm_parameter.image_tag.insecure_value
  target_group_arns      = module.edge.target_group_arns

  services = {
    api = {
      port               = 8080
      memory_reservation = 512
      memory             = 768
      desired_count      = var.service_desired_count
      single_instance    = false
      secret_keys        = local.api_secret_keys
      environment        = { PORT = "8080" }
      health_command     = null
    }
    worker = {
      port               = null
      memory_reservation = 256
      memory             = 384
      desired_count      = 1
      single_instance    = true
      secret_keys        = local.worker_secret_keys
      environment = {
        WORKER_PORT    = "8090"
        EMAIL_PROVIDER = "ses"
        EMAIL_FROM     = "Allfit One <${local.email_sender}>"
      }
      # The image has Node and no curl.
      health_command = "node -e \"fetch('http://127.0.0.1:8090/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))\""
      # SES with no key (ADR-049): the role sends from the sender address and nothing else.
      task_role_policy = module.email.send_policy
    }
    studio-web     = local.web_service
    backoffice-web = local.web_service
    space-web      = local.web_service
  }

  tasks = {
    migrator = {
      memory_reservation = 256
      memory             = 512
      secret_keys        = ["DB_HOST", "DB_NAME", "DB_MASTER_USERNAME", "DB_MASTER_PASSWORD", "ALLFIT_API_DB_PASSWORD"]
      environment        = { DB_PORT = tostring(module.database.port) }
    }
  }
}

module "deploy_role" {
  source = "../modules/deploy-role"

  name              = "allfitone-production-deploy"
  oidc_provider_arn = module.github_oidc.provider_arn
  # The repository sends immutable subjects: owner and repository ids, not just names.
  github_repository   = "allfitone@163363230/allfitone@1323545815"
  github_environment  = "Production"
  region              = var.region
  account_id          = var.account_id
  cluster_name        = module.compute.cluster_name
  migrator_family     = module.services.task_definition_families["migrator"]
  pass_role_arns      = concat([module.services.execution_role_arn], values(module.services.task_role_arns))
  ecr_repository_arns = values(module.registry.repository_arns)
  image_tag_parameter = aws_ssm_parameter.image_tag.name
  migrator_log_group  = module.services.log_group_names["migrator"]
}

# Static sites from other repositories: no server, so S3 behind CloudFront.
module "landing" {
  source = "../modules/static-site"

  name              = "allfitone-www-${var.account_id}"
  host              = "www.allfit.one"
  certificate_arn   = aws_acm_certificate_validation.this.certificate_arn
  oidc_provider_arn = module.github_oidc.provider_arn
  github_repository = "allfitone@163363230/allfitone-landing-page@1297734568"
  redirects = {
    "/"                     = { location = "/es", status = 307 }
    "/privacy/analytics"    = { location = "/es/legal/analytics", status = 308 }
    "/es/privacy/analytics" = { location = "/es/legal/analytics", status = 308 }
    "/en/privacy/analytics" = { location = "/en/legal/analytics", status = 308 }
    "/ambassadors/william"  = { location = "/es/ambassadors/william", status = 308 }
  }
}

module "design_system" {
  source = "../modules/static-site"

  name              = "allfitone-ds-${var.account_id}"
  host              = "ds.allfit.one"
  certificate_arn   = aws_acm_certificate_validation.this.certificate_arn
  oidc_provider_arn = module.github_oidc.provider_arn
  github_repository = "allfitone@163363230/allfitone-design-system@1309167856"
  redirects = {
    "/" = { location = "/ui-foundation", status = 307 }
  }
}
