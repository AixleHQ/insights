variable "cluster_name" {
  type = string
}

variable "service_name" {
  type = string
}

variable "cpu_average_target" {
  type = number
}

variable "memory_average_target" {
  type = number
}

variable "scale_in_cooldown" {
  type = number
}

variable "scale_out_cooldown" {
  type = number
}

variable "max_capacity" {
  type = number
}

variable "min_capacity" {
  type = number
}
