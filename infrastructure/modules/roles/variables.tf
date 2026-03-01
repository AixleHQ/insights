variable "region" {
  type = string
}

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "ssm_key_prefix" {
  type = string
}

variable "bucket_arns" {
  type = set(string)
}
