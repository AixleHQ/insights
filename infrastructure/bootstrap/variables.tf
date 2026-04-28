variable "region" {
  type    = string
  default = "us-east-2"
}

variable "project" {
  type    = string
  default = "db90"
}

variable "application" {
  type    = string
  default = "app"
}

variable "domain" {
  type    = string
  default = "db90.example.com"
}

variable "github_repo" {
  type    = string
  default = "dualboot-partners/db90-rails"
}
