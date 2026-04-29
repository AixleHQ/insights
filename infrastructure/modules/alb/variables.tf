variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "name" {
  type = string
}

variable "subnets" {
  type = list(string)
}

variable "vpc_id" {
  type = string
}

variable "security_groups" {
  type = list(string)
}

variable "certificate_arn" {
  type    = string
  default = ""
}

variable "health_check_path" {
  type    = string
  default = ""
}

variable "app_hostnames" {
  type = list(string)
}

variable "target_groups" {
  type = map(object({
    health_check_path                = optional(string, null)
    health_check_interval            = optional(number, null)
    health_check_healthy_threshold   = optional(number, null)
    health_check_unhealthy_threshold = optional(number, null)
    # Keycloak needs ALB stickiness when multiple ECS tasks run (session tied to node — see AUTH_SESSION_ID route).
    stickiness_enabled = optional(bool, false)
  }))
}

variable "alb_name" {
  type = string
}

variable "internal" {
  type    = bool
  default = false
}

variable "health_check_interval" {
  type    = number
  default = 10
}

variable "health_check_timeout" {
  type    = number
  default = 5
}

variable "health_check_healthy_threshold" {
  type    = number
  default = 2
}

variable "health_check_unhealthy_threshold" {
  type    = number
  default = 2
}

variable "deregistration_delay" {
  type    = number
  default = 5
}

variable "listener_rules" {
  type = list(object({
    priority = number
    hosts    = list(string)
    service  = string
    auth     = optional(bool, false)
  }))
  default = []
}

variable "oidc_issuer" {
  type    = string
  default = ""
}

variable "oidc_authorization_endpoint" {
  type    = string
  default = ""
}

variable "oidc_token_endpoint" {
  type    = string
  default = ""
}

variable "oidc_user_info_endpoint" {
  type    = string
  default = ""
}

variable "oidc_client_id" {
  type    = string
  default = ""
}

variable "oidc_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}
