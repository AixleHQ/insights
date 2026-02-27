variable "name" {
  type = string
}

variable "environments_by_count" {
  type = list(object({
    name     = string
    priority = number
    count    = number
  }))
  default = []
}

variable "other_count" {
  type    = number
  default = 30
}
