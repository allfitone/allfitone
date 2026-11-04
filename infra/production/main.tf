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

  worker_secret_keys = concat(local.shared_secret_keys, [
    "CRON_SECRET", "RESEND_API_KEY", "RESEND_FROM_EMAIL",
    "STAFF_INVITATION_DELIVERY_ENABLED", "STAFF_INVITATION_PUBLIC_BASE_URL",
    "CLIENT_INVITATION_DELIVERY_ENABLED", "ACCOUNT_RECOVERY_DELIVERY_ENABLED",
  ])

  # Above the load balancer's 60 s idle timeout, so the app never closes a
  # connection the load balancer is about to reuse.
  web_environment = { PORT = "3000", KEEP_ALIVE_TIMEOUT = "65000" }

  # Hosts per app. `rule_ordinal` is the listener rule priority.
  routes = {
    api            = { hosts = ["api.allfit.one"], port = 8080, health_path = "/health", behind_cdn = false, rule_ordinal = 10 }
    studio-web     = { hosts = ["studio.allfit.one"], port = 3000, health_path = "/", behind_cdn = true, rule_ordinal = 20 }
    backoffice-web = { hosts = ["backoffice.allfit.one"], port = 3000, health_path = "/", behind_cdn = true, rule_ordinal = 30 }
    space-web      = { hosts = ["www.allfit.one", "space.allfit.one"], port = 3000, health_path = "/es", behind_cdn = true, rule_ordinal = 40 }
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
}

module "certificate" {
  source = "../modules/certificate"

  domain_names = flatten([for route in values(local.routes) : route.hosts])
}

# Waits until the CNAMEs exist in GoDaddy and ACM has issued the certificate.
resource "aws_acm_certificate_validation" "this" {
  certificate_arn = module.certificate.arn
}

module "edge" {
  source = "../modules/edge"

  name                       = "allfitone"
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.public_subnet_ids
  instance_security_group_id = module.compute.instance_security_group_id
  certificate_arn            = aws_acm_certificate_validation.this.certificate_arn
  origin_verify_secret       = var.origin_verify_secret
  apps                       = local.routes
}

module "services" {
  source = "../modules/services"

  name                   = "allfitone-production"
  region                 = var.region
  cluster_arn            = module.compute.cluster_arn
  capacity_provider_name = module.compute.capacity_provider_name
  secret_arn             = aws_secretsmanager_secret.environment.arn
  repository_urls        = module.registry.repository_urls
  image_tag              = var.image_tag
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
      environment        = { WORKER_PORT = "8090" }
      # The image has Node and no curl.
      health_command = "node -e \"fetch('http://127.0.0.1:8090/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))\""
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

