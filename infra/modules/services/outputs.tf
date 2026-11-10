output "service_names" {
  value = { for key, s in aws_ecs_service.this : key => s.name }
}

output "task_definition_families" {
  description = "Run one with `aws ecs run-task --task-definition <family>`."
  value       = { for key, td in aws_ecs_task_definition.task : key => td.family }
}

output "log_group_names" {
  value = { for key, g in aws_cloudwatch_log_group.this : key => g.name }
}

output "execution_role_arn" {
  description = "The agent's role, named by every task definition; the deploy role may pass it to ECS."
  value       = aws_iam_role.execution.arn
}

output "task_role_arns" {
  description = "The app's own role, per service that has one; the deploy role may pass them to ECS too."
  value       = { for key, role in aws_iam_role.task : key => role.arn }
}
