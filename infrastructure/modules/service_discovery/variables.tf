variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "namespace_name" {
  type = string
}

variable "description" {
  type    = string
  default = "Private DNS namespace for service discovery"
}

variable "services" {
  type = map(object({
    dns_ttl           = number
    failure_threshold = number
  }))
  default = {}
}
