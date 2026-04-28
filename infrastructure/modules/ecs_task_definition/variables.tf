variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "name" {
  type = string
}

variable "family" {
  type = string
}

variable "network_mode" {
  type = string
}

variable "requires_compatibilities" {
  type = list(string)
}

variable "cpu" {
  type = number
}

variable "memory" {
  type = number
}

variable "execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "container_definitions" {
  type = any
}

variable "first_add" {
  type    = bool
  default = false
}
