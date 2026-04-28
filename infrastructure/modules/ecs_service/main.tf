resource "aws_ecs_service" "main" {
  name                               = var.service_name
  cluster                            = var.cluster_id
  task_definition                    = var.task_definition_arn
  desired_count                      = var.desired_count
  deployment_minimum_healthy_percent = var.min_percent
  deployment_maximum_percent         = var.max_percent
  launch_type                        = var.enable_fargate_spot ? null : var.launch_type
  scheduling_strategy                = var.scheduling_strategy
  enable_execute_command             = var.enable_execute_command
  propagate_tags                     = "SERVICE"
  health_check_grace_period_seconds  = length(var.load_balancers) > 0 ? var.health_check_grace_period_seconds : null

  network_configuration {
    security_groups  = var.security_groups
    subnets          = var.subnets
    assign_public_ip = var.assign_public_ip
  }

  dynamic "load_balancer" {
    for_each = var.load_balancers

    content {
      target_group_arn = load_balancer.value.target_group_arn
      container_name   = load_balancer.value.container_name
      container_port   = load_balancer.value.container_port
    }
  }

  dynamic "service_registries" {
    for_each = var.service_discovery

    content {
      registry_arn   = service_registries.value.registry_arn
      container_name = service_registries.value.container_name
    }
  }

  dynamic "capacity_provider_strategy" {
    for_each = var.enable_fargate_spot ? toset([1]) : toset([])
    content {
      capacity_provider = "FARGATE"
      weight            = 1
      base              = var.fargate_base
    }
  }

  dynamic "capacity_provider_strategy" {
    for_each = var.enable_fargate_spot ? toset([1]) : toset([])
    content {
      capacity_provider = "FARGATE_SPOT"
      weight            = 100
      base              = 0
    }
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}
