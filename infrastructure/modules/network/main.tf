data "aws_availability_zones" "available" {}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.7.1"

  name = "${var.environment}-vpc"
  cidr = var.cidr

  azs                    = data.aws_availability_zones.available.names
  database_subnet_suffix = "${var.environment}-db"

  private_subnets     = var.private_subnets
  public_subnets      = var.public_subnets
  database_subnets    = var.database_subnets
  elasticache_subnets = var.elasticache_subnets

  create_database_subnet_group = true

  enable_nat_gateway   = true
  single_nat_gateway   = var.single_nat_gateway
  enable_dns_hostnames = true
  enable_dns_support   = true

  map_public_ip_on_launch = true

  manage_default_security_group = false
  manage_default_route_table    = false
  manage_default_network_acl    = false
}
