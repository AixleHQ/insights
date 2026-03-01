variable "cidr" {
  type = string
}

variable "public_subnets" {
  type = list(string)
}

variable "private_subnets" {
  type = list(string)
}

variable "database_subnets" {
  type = list(string)
}

variable "elasticache_subnets" {
  type = list(string)
}

variable "environment" {
  type = string
}

variable "single_nat_gateway" {
  type    = bool
  default = true
}
