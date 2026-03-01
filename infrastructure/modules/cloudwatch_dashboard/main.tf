resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project}-${var.environment}-monitoring"

  dashboard_body = jsonencode({
    widgets = concat(
      local.app_widgets,
      local.infrastructure_widgets
    )
  })
}

locals {
  app_widgets = [
    {
      type   = "metric"
      x      = 0
      y      = 0
      width  = 12
      height = 6
      properties = {
        title  = "App Services - CPU & Memory"
        region = var.region
        metrics = [
          ["AWS/ECS", "CPUUtilization", "ServiceName", var.services.api, "ClusterName", var.cluster_name, { stat = "Average", label = "API CPU" }],
          [".", "MemoryUtilization", ".", ".", ".", ".", { stat = "Average", label = "API Memory" }],
          [".", "CPUUtilization", ".", var.services.web, ".", ".", { stat = "Average", label = "Web CPU" }],
          [".", "MemoryUtilization", ".", ".", ".", ".", { stat = "Average", label = "Web Memory" }],
          [".", "CPUUtilization", ".", var.services.sidekiq, ".", ".", { stat = "Average", label = "Sidekiq CPU" }],
          [".", "MemoryUtilization", ".", ".", ".", ".", { stat = "Average", label = "Sidekiq Memory" }]
        ]
        period = 300
        yAxis = {
          left = { min = 0, max = 100 }
        }
      }
    },
    {
      type   = "metric"
      x      = 12
      y      = 0
      width  = 12
      height = 6
      properties = {
        title  = "Temporal & Keycloak - CPU & Memory"
        region = var.region
        metrics = [
          ["AWS/ECS", "CPUUtilization", "ServiceName", var.services.temporal, "ClusterName", var.cluster_name, { stat = "Average", label = "Temporal CPU" }],
          [".", "MemoryUtilization", ".", ".", ".", ".", { stat = "Average", label = "Temporal Memory" }],
          [".", "CPUUtilization", ".", var.services.temporal_worker, ".", ".", { stat = "Average", label = "Worker CPU" }],
          [".", "MemoryUtilization", ".", ".", ".", ".", { stat = "Average", label = "Worker Memory" }],
          [".", "CPUUtilization", ".", var.services.temporal_ui, ".", ".", { stat = "Average", label = "Temporal UI CPU" }],
          [".", "MemoryUtilization", ".", ".", ".", ".", { stat = "Average", label = "Temporal UI Memory" }],
          [".", "CPUUtilization", ".", var.services.keycloak, ".", ".", { stat = "Average", label = "Keycloak CPU" }],
          [".", "MemoryUtilization", ".", ".", ".", ".", { stat = "Average", label = "Keycloak Memory" }]
        ]
        period = 300
        yAxis = {
          left = { min = 0, max = 100 }
        }
      }
    },
    {
      type   = "metric"
      x      = 0
      y      = 6
      width  = 12
      height = 6
      properties = {
        title  = "ALB - Requests & Latency"
        region = var.region
        metrics = [
          ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix, { stat = "Sum", label = "Requests" }],
          [".", "TargetResponseTime", "TargetGroup", var.tg_arn_suffix, "LoadBalancer", var.alb_arn_suffix, { stat = "Average", label = "Latency" }],
          [".", "HTTPCode_Target_5XX_Count", "LoadBalancer", var.alb_arn_suffix, { stat = "Sum", label = "5XX Errors" }]
        ]
        period = 300
      }
    }
  ]

  infrastructure_widgets = [
    {
      type   = "metric"
      x      = 0
      y      = 12
      width  = 12
      height = 6
      properties = {
        title  = "Redis - CPU & Memory"
        region = var.region
        metrics = [
          ["AWS/ElastiCache", "CPUUtilization", "CacheClusterId", var.redis_cluster_id, { stat = "Average", label = "Redis CPU" }],
          [".", "DatabaseMemoryUsagePercentage", ".", ".", { stat = "Average", label = "Redis Memory" }]
        ]
        period = 300
      }
    }
  ]
}
