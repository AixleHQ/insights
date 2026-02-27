variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "enable_container_insights" {
  type    = string
  default = "disabled"
}
