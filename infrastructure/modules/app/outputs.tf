output "service_name" {
  value = module.service.name
}

output "task_definition_arn" {
  value = module.task_definition.arn
}

output "task_definition_family" {
  value = module.task_definition.family
}
