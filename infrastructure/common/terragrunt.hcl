locals {
  project = "db90"
  region  = "us-east-2"
}

generate "backend" {
  path      = "backend.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  backend "s3" {
    bucket         = "${local.project}-tf-bucket"
    dynamodb_table = "${local.project}-tf-lock"
    encrypt        = true
    key            = "${local.project}/${local.region}/terraform.tfstate"
    region         = "${local.region}"
  }
}
EOF
}
