/**
 * What runs on the cluster: one ECS service per app, plus task definitions
 * that only run on demand (the migrator).
 *
 * Containers use bridge networking with host port 0, so Docker picks a free
 * port on the machine and ECS registers it with the app's target group; two
 * copies of an app, old and new during a deploy, never fight over a port.
 *
 * Every credential arrives as an environment variable read from one key of the
 * environment's single secret, at the moment the container starts. A key that
 * is missing stops the task from starting, which is louder and earlier than an
 * app failing on its first request. Containers get no IAM role: none of the
 * apps calls AWS.
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
  workloads = merge(
    { for key, s in var.services : key => {
      memory_reservation = s.memory_reservation
      memory             = s.memory
      secret_keys        = s.secret_keys
      environment        = s.environment
      port               = s.port
      health_command     = s.health_command
    } },
    { for key, t in var.tasks : key => {
      memory_reservation = t.memory_reservation
      memory             = t.memory
      secret_keys        = t.secret_keys
      environment        = t.environment
      port               = null
      health_command     = null
    } },
  )

  containers = {
    for key, w in local.workloads : key => [merge(
      {
        name              = key
        image             = "${var.repository_urls[key]}:${var.image_tag}"
        essential         = true
        memoryReservation = w.memory_reservation
        memory            = w.memory
        environment = [
          for name, value in merge(w.environment, { RELEASE = var.image_tag }) : { name = name, value = value }
        ]
        secrets = [
          for secret_key in w.secret_keys : { name = secret_key, valueFrom = "${var.secret_arn}:${secret_key}::" }
        ]
        logConfiguration = {
          logDriver = "awslogs"
          options = {
            awslogs-group         = aws_cloudwatch_log_group.this[key].name
            awslogs-region        = var.region
            awslogs-stream-prefix = key
          }
        }
      },
      w.port == null ? {} : {
        portMappings = [{ containerPort = w.port, hostPort = 0, protocol = "tcp" }]
      },
      w.health_command == null ? {} : {
        healthCheck = {
          command     = ["CMD-SHELL", w.health_command]
          interval    = 30
          timeout     = 5
          retries     = 3
          startPeriod = 15
        }
      },
    )]
  }
}

resource "aws_cloudwatch_log_group" "this" {
  for_each = local.workloads

  name              = "/${var.name}/${each.key}"
  retention_in_days = var.log_retention_days
}

# Used by the ECS agent, not by the app: pulls the image, writes logs, reads the secret.
resource "aws_iam_role" "execution" {
  name = "${var.name}-task-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "read_secret" {
  name = "read-environment-secret"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = var.secret_arn
    }]
  })
}

resource "aws_ecs_task_definition" "service" {
  for_each = var.services

  family                   = "${var.name}-${each.key}"
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.execution.arn
  container_definitions    = jsonencode(local.containers[each.key])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
}

resource "aws_ecs_task_definition" "task" {
  for_each = var.tasks

  family                   = "${var.name}-${each.key}"
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.execution.arn
  container_definitions    = jsonencode(local.containers[each.key])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
}

resource "aws_ecs_service" "this" {
  for_each = var.services

  name            = each.key
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = each.value.desired_count

  # A single-instance service stops the old copy first, so two never overlap.
  deployment_minimum_healthy_percent = each.value.single_instance ? 0 : 100
  deployment_maximum_percent         = each.value.single_instance ? 100 : 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  capacity_provider_strategy {
    capacity_provider = var.capacity_provider_name
    weight            = 1
  }

  ordered_placement_strategy {
    type  = "spread"
    field = "attribute:ecs.availability-zone"
  }

  dynamic "load_balancer" {
    for_each = each.value.port == null ? [] : [each.value.port]
    content {
      target_group_arn = var.target_group_arns[each.key]
      container_name   = each.key
      container_port   = load_balancer.value
    }
  }

  health_check_grace_period_seconds = each.value.port == null ? null : 30
}
