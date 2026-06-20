terraform {
  backend "s3" {
    bucket         = "db90-tf-bucket"
    dynamodb_table = "db90-tf-lock"
    encrypt        = true
    key            = "db90/us-east-2/bootstrap/terraform.tfstate"
    region         = "us-east-2"
  }
}
