variable "region" {
  type = string
}

variable "project" {
  type = string
}

variable "github_app" {
  type = object({
    id             = string
    webhook_secret = string
    key_base64     = string
  })
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "runners_maximum_count" {
  description = "Maximum number of concurrent self-hosted runners"
  type        = number
}

variable "runner_instance_type" {
  description = "EC2 instance type for runners (spot by default via upstream module)"
  type        = string
}

variable "enable_organization_runners" {
  description = "Register runners at organization level; false = repository level only"
  type        = bool
}
