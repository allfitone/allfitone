mock_provider "aws" {}

variables {
  name                   = "allfit-test"
  region                 = "us-east-1"
  cluster_arn            = "arn:aws:ecs:us-east-1:000000000000:cluster/allfit-test"
  capacity_provider_name = "allfit-test-ec2"
  secret_arn             = "arn:aws:secretsmanager:us-east-1:000000000000:secret:allfitone/test-AbCdEf"
  image_tag              = "abc1234"
  repository_urls = {
    api      = "000000000000.dkr.ecr.us-east-1.amazonaws.com/allfitone/api"
    worker   = "000000000000.dkr.ecr.us-east-1.amazonaws.com/allfitone/worker"
    migrator = "000000000000.dkr.ecr.us-east-1.amazonaws.com/allfitone/migrator"
  }
  target_group_arns = {
    api = "arn:aws:elasticloadbalancing:us-east-1:000000000000:targetgroup/allfit-test-api/0123456789abcdef"
  }
  services = {
    api = {
      port               = 8080
      memory_reservation = 512
      memory             = 768
      desired_count      = 1
      single_instance    = false
      secret_keys        = ["DATABASE_URL", "WORKOS_ISSUER"]
      environment        = { PORT = "8080" }
      health_command     = null
    }
    worker = {
      port               = null
      memory_reservation = 256
      memory             = 384
      desired_count      = 1
      single_instance    = true
      secret_keys        = ["DATABASE_URL", "CRON_SECRET"]
      environment        = { WORKER_PORT = "8090" }
      health_command     = "node -e \"process.exit(0)\""
    }
  }
  tasks = {
    migrator = {
      memory_reservation = 256
      memory             = 512
      secret_keys        = ["DB_HOST", "DB_MASTER_PASSWORD"]
      environment        = {}
    }
  }
}

run "containers_get_whatever_port_the_machine_has_free" {
  command = plan

  assert {
    condition = alltrue(flatten([
      for td in aws_ecs_task_definition.service : [
        for c in jsondecode(td.container_definitions) : [
          for p in try(c.portMappings, []) : p.hostPort == 0
        ]
      ]
    ]))
    error_message = "Bridge mode with a fixed host port allows one container per machine and blocks deploys."
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.service["api"].container_definitions)[0].portMappings[0].containerPort == 8080
    error_message = "The container port is the one the app listens on."
  }
}

run "a_failed_deploy_rolls_back" {
  command = plan

  assert {
    condition = alltrue([
      for s in aws_ecs_service.this : s.deployment_circuit_breaker[0].enable && s.deployment_circuit_breaker[0].rollback
    ])
    error_message = "A version that never becomes healthy must roll back on its own."
  }

  assert {
    condition     = aws_ecs_service.this["api"].deployment_minimum_healthy_percent == 100 && aws_ecs_service.this["api"].deployment_maximum_percent == 200
    error_message = "The new copy starts and turns healthy before the old one stops."
  }
}

run "the_worker_never_runs_twice" {
  command = plan

  assert {
    condition = (
      aws_ecs_service.this["worker"].deployment_maximum_percent == 100
      && aws_ecs_service.this["worker"].deployment_minimum_healthy_percent == 0
    )
    error_message = "The old worker stops before the new one starts."
  }

  assert {
    condition     = length(aws_ecs_service.this["worker"].load_balancer) == 0
    error_message = "The worker takes no traffic."
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.service["worker"].container_definitions)[0].healthCheck.command[0] == "CMD-SHELL"
    error_message = "Without a load balancer, the container's own check is what tells ECS it is alive."
  }
}

run "credentials_come_only_from_the_environment_secret" {
  command = plan

  assert {
    condition = alltrue(flatten([
      for td in concat(values(aws_ecs_task_definition.service), values(aws_ecs_task_definition.task)) : [
        for s in jsondecode(td.container_definitions)[0].secrets :
        s.valueFrom == "${var.secret_arn}:${s.name}::"
      ]
    ]))
    error_message = "Each variable is one key of the single environment secret, under its own name."
  }

  assert {
    condition     = jsondecode(aws_iam_role_policy.read_secret.policy).Statement[0].Resource == var.secret_arn
    error_message = "The execution role reads that one secret and nothing else."
  }
}

run "the_migrator_runs_on_demand_only" {
  command = plan

  assert {
    condition     = contains(keys(aws_ecs_task_definition.task), "migrator") && !contains(keys(aws_ecs_service.this), "migrator")
    error_message = "The migrator is a task definition run by hand, never a long-lived service."
  }
}

run "logs_last_fourteen_days" {
  command = plan

  assert {
    condition     = alltrue([for g in aws_cloudwatch_log_group.this : g.retention_in_days == 14])
    error_message = "Logs are kept fourteen days."
  }

  assert {
    condition     = toset(keys(aws_cloudwatch_log_group.this)) == toset(["api", "worker", "migrator"])
    error_message = "Every service and task writes to a group of its own."
  }
}

run "containers_know_their_region_and_release" {
  command = plan

  assert {
    condition = alltrue([
      for td in values(aws_ecs_task_definition.service) :
      contains(jsondecode(td.container_definitions)[0].environment, { name = "AWS_REGION", value = "us-east-1" })
      && contains(jsondecode(td.container_definitions)[0].environment, { name = "RELEASE", value = "abc1234" })
    ])
    error_message = "Measurements are tagged with the region and the release the container runs."
  }
}

run "only_a_service_that_names_a_policy_gets_a_role_of_its_own" {
  command = plan

  variables {
    services = {
      api = {
        port               = 8080
        memory_reservation = 512
        memory             = 768
        desired_count      = 1
        single_instance    = false
        secret_keys        = ["DATABASE_URL"]
        environment        = { PORT = "8080" }
        health_command     = null
      }
      worker = {
        port               = null
        memory_reservation = 256
        memory             = 384
        desired_count      = 1
        single_instance    = true
        secret_keys        = ["DATABASE_URL"]
        environment        = { WORKER_PORT = "8090" }
        health_command     = null
        task_role_policy = jsonencode({
          Version   = "2012-10-17"
          Statement = [{ Effect = "Allow", Action = "ses:SendEmail", Resource = "*" }]
        })
      }
    }
  }

  assert {
    condition     = keys(aws_iam_role.task) == ["worker"]
    error_message = "Only the service that names a policy may get a task role."
  }

  assert {
    condition     = aws_ecs_task_definition.service["api"].task_role_arn == null
    error_message = "A service without a policy must run with no role at all."
  }

  assert {
    condition     = jsondecode(aws_iam_role_policy.task["worker"].policy).Statement[0].Action == "ses:SendEmail"
    error_message = "The role must carry exactly the policy the service named."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role.task["worker"].assume_role_policy).Statement :
      s.Principal.Service == "ecs-tasks.amazonaws.com"
      && s.Condition.StringEquals["aws:SourceAccount"] == "000000000000"
    ])
    error_message = "Only ECS acting for this account's tasks may assume the role."
  }
}
