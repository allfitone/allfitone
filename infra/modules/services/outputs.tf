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
