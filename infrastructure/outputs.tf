output "vpc_id" {
  value = module.network.self.vpc_id
}

output "alb_dns_name" {
  value = module.alb.alb_dns_name
}

output "app_url" {
  value = "https://${var.app_domain}"
}

output "keycloak_url" {
  value = "https://${var.kc_domain}"
}

output "temporal_ui_url" {
  value = "https://${var.temporal_ui_domain}"
}

output "database_host" {
  value     = var.app_database.host
  sensitive = true
}

output "redis_endpoint" {
  value     = aws_elasticache_replication_group.app.primary_endpoint_address
  sensitive = true
}

output "s3_raw_events_bucket" {
  value = module.s3_raw_events.bucket_name
}

output "ecs_cluster_name" {
  value = module.ecs_cluster.name
}

output "service_discovery_endpoints" {
  value = module.service_discovery.service_endpoints
}
