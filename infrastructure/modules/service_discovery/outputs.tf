output "namespace_id" {
  value = aws_service_discovery_private_dns_namespace.this.id
}

output "namespace_name" {
  value = aws_service_discovery_private_dns_namespace.this.name
}

output "namespace_arn" {
  value = aws_service_discovery_private_dns_namespace.this.arn
}

output "namespace_hosted_zone" {
  value = aws_service_discovery_private_dns_namespace.this.hosted_zone
}

output "service_arns" {
  value = { for k, v in aws_service_discovery_service.this : k => v.arn }
}

output "service_ids" {
  value = { for k, v in aws_service_discovery_service.this : k => v.id }
}

output "service_endpoints" {
  value = {
    for k, v in aws_service_discovery_service.this :
    k => "${v.name}.${aws_service_discovery_private_dns_namespace.this.name}"
  }
}
