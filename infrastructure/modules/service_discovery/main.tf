resource "aws_service_discovery_private_dns_namespace" "this" {
  name        = var.namespace_name
  description = var.description
  vpc         = var.vpc_id

  tags = {
    Name        = "${var.project}-${var.environment}-${var.namespace_name}"
    Environment = var.environment
    Project     = var.project
  }
}

resource "aws_service_discovery_service" "this" {
  for_each = var.services

  name = each.key

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.this.id

    dns_records {
      ttl  = each.value.dns_ttl
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = each.value.failure_threshold
  }

  tags = {
    Name        = "${var.project}-${var.environment}-${each.key}"
    Environment = var.environment
    Project     = var.project
    Service     = each.key
  }
}
