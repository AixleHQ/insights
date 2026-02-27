variable "region" {
  type = string
}

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "name" {
  type = string
}

variable "repository_name" {
  type    = string
  default = ""
}

variable "image" {
  type    = string
  default = ""
}

variable "cluster_id" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "security_group_ids" {
  type = list(string)
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "ecs_role_arn" {
  type = string
}

variable "ecs_service" {
  type = object({
    cpu    = number
    memory = number

    desired_count       = number
    enable_fargate_spot = bool
    fargate_base        = number

    autoscaling_min_size = number
    autoscaling_max_size = number

    first_add = bool
  })
}

variable "variables" {
  type = map(string)
}

variable "secrets" {
  type = list(object({
    name      = any
    valueFrom = any
  }))
}

variable "service_name" {
  type = string
}

variable "family" {
  type = string
}

variable "file_ecs_task_definition_sh" {
  type    = string
  default = "/infra/modules/scripts/ecs-task-definition.sh"
}

variable "logs_retention_in_days" {
  type = number
}

variable "ecs_service_min_percent" {
  type = number
}

variable "ecs_service_max_percent" {
  type = number
}

variable "autoscaling" {
  type = object({
    cpu_average_target    = number
    memory_average_target = number
    scale_in_cooldown     = number
    scale_out_cooldown    = number
  })
}

variable "containers" {
  type = map(object({
    name             = string
    container_port   = optional(number)
    command          = optional(list(string))
    workingDirectory = optional(string)
    log_prefix       = string
    mount_points = optional(list(object({
      sourceVolume  = string
      containerPath = string
      readOnly      = bool
    })), [])
    portMappings = optional(list(object({
      containerPort = number
      hostPort      = number
      protocol      = string
    })), [])
  }))
}

variable "load_balancers" {
  type = map(object({
    target_group_arn = string
    container_name   = string
    container_port   = number
  }))
  default = {}
}

variable "service_discovery" {
  type = list(object({
    registry_arn   = string
    container_name = string
    container_port = optional(number)
  }))
  default = []
}
