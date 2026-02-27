variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "region" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "services" {
  type = object({
    api             = string
    web             = string
    sidekiq         = string
    temporal        = string
    temporal_worker = string
    temporal_ui     = string
    keycloak        = string
  })
}

variable "alb_arn_suffix" {
  type = string
}

variable "tg_arn_suffix" {
  type = string
}

variable "redis_cluster_id" {
  type = string
}
