variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "name" {
  type = string
}

variable "service_name" {
  type = string
}

variable "cluster_id" {
  type = string
}

variable "task_definition_arn" {
  type = string
}

variable "desired_count" {
  type = number
}

variable "min_percent" {
  type = number
}

variable "max_percent" {
  type = number
}

variable "launch_type" {
  type    = string
  default = "FARGATE"
}

variable "scheduling_strategy" {
  type    = string
  default = "REPLICA"
}

variable "security_groups" {
  type = list(string)
}

variable "subnets" {
  type = list(string)
}

variable "enable_execute_command" {
  type    = bool
  default = true
}

variable "assign_public_ip" {
  type    = bool
  default = false
}

variable "enable_fargate_spot" {
  type    = bool
  default = false
}

variable "fargate_base" {
  type    = number
  default = 1
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

variable "health_check_grace_period_seconds" {
  type    = number
  default = 60
}
