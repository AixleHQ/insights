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

# --- GitHub Actions self-hosted runners (optional) ---

variable "enable_github_runners" {
  description = "Provision spot EC2 GitHub Actions runners in a dedicated CI/CD VPC"
  type        = bool
  default     = false
}

variable "github_app" {
  description = "GitHub App credentials for self-hosted runners (required when enable_github_runners = true)"
  type = object({
    id             = string
    webhook_secret = string
    key_base64     = string
  })
  default = {
    id             = ""
    webhook_secret = ""
    key_base64     = ""
  }
  sensitive = true
}

variable "runners_maximum_count" {
  description = "Maximum concurrent self-hosted runners"
  type        = number
  default     = 5
}

variable "runner_instance_type" {
  description = "EC2 instance type for runners (upstream module defaults to spot capacity)"
  type        = string
  default     = "c7i.large"
}

variable "enable_organization_runners" {
  description = "Register runners at GitHub org level; false limits to the installing repository"
  type        = bool
  default     = false
}

variable "cicd_vpc" {
  description = "Dedicated VPC for CI/CD runners (must not overlap app env VPC CIDRs)"
  type = object({
    cidr            = string
    azs             = list(string)
    private_subnets = list(string)
    public_subnets  = list(string)
  })
  default = {
    cidr            = "10.200.0.0/16"
    azs             = ["us-east-2a", "us-east-2b", "us-east-2c"]
    private_subnets = ["10.200.1.0/24", "10.200.2.0/24", "10.200.3.0/24"]
    public_subnets  = ["10.200.101.0/24", "10.200.102.0/24", "10.200.103.0/24"]
  }
}
