variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "name" {
  type = string
}

variable "expiration_days" {
  type    = number
  default = 0
}

variable "versioning" {
  type    = bool
  default = false
}
