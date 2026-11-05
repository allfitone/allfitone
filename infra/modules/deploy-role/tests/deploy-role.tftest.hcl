mock_provider "aws" {}

variables {
  name                = "allfit-test-deploy"
  oidc_provider_arn   = "arn:aws:iam::000000000000:oidc-provider/token.actions.githubusercontent.com"
  github_repository   = "allfitone/allfitone"
  github_environment  = "aws-production"
  region              = "us-east-1"
  account_id          = "000000000000"
  cluster_name        = "allfit-test"
  migrator_family     = "allfit-test-migrator"
  pass_role_arns      = ["arn:aws:iam::000000000000:role/allfit-test-task-execution"]
  image_tag_parameter = "/allfitone/test/image-tag"
  migrator_log_group  = "/allfit-test/migrator"
  ecr_repository_arns = [
    "arn:aws:ecr:us-east-1:000000000000:repository/allfitone/api",
    "arn:aws:ecr:us-east-1:000000000000:repository/allfitone/worker",
  ]
}

run "only_the_production_environment_of_this_repository_can_assume_it" {
  command = plan

  assert {
    condition = (
      jsondecode(aws_iam_role.this.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"]
      == "repo:allfitone/allfitone:environment:aws-production"
    )
    error_message = "The trust must name this repository and environment exactly, never a wildcard"
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.this.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"]
      == "sts.amazonaws.com"
    )
    error_message = "The trust must require the STS audience"
  }

  assert {
    condition     = jsondecode(aws_iam_role.this.assume_role_policy).Statement[0].Action == "sts:AssumeRoleWithWebIdentity"
    error_message = "Only web identity federation may assume the role"
  }
}

run "no_statement_grants_every_action" {
  command = plan

  assert {
    condition = alltrue(flatten([
      for s in jsondecode(aws_iam_role_policy.deploy.policy).Statement : [
        for a in flatten([s.Action]) : !endswith(a, "*")
      ]
    ]))
    error_message = "Every action must be named; no service:* or *"
  }
}

run "pass_role_is_limited_to_the_task_roles_and_to_ecs" {
  command = plan

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.deploy.policy).Statement :
      !contains(flatten([s.Action]), "iam:PassRole") || (
        toset(flatten([s.Resource])) == toset(var.pass_role_arns)
        && try(s.Condition.StringEquals["iam:PassedToService"], "") == "ecs-tasks.amazonaws.com"
      )
    ])
    error_message = "PassRole may only hand the task roles to ECS"
  }
}

run "image_pushes_reach_only_the_listed_repositories" {
  command = plan

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.deploy.policy).Statement :
      !contains(flatten([s.Action]), "ecr:PutImage") || toset(flatten([s.Resource])) == toset(var.ecr_repository_arns)
    ])
    error_message = "Pushing images must be scoped to the repositories"
  }
}
