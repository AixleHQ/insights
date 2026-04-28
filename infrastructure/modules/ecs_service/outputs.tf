output "id" {
  value = aws_ecs_service.main.id
}

output "name" {
  value = var.service_name
}
