locals {
  all_ips = "0.0.0.0/0"
}

data "aws_vpc" "this" {
  id = var.vpc_id
}

module "alb" {
  source  = "terraform-aws-modules/security-group/aws"
  version = "~> 5.1"

  name   = "${var.project}-${var.environment}-sg-alb"
  vpc_id = var.vpc_id

  ingress_with_cidr_blocks = [
    {
      rule        = "https-443-tcp"
      cidr_blocks = local.all_ips
    },
    {
      rule        = "http-80-tcp"
      cidr_blocks = local.all_ips
    },
  ]

  egress_rules = ["all-all"]
}

module "ecs" {
  source  = "terraform-aws-modules/security-group/aws"
  version = "~> 5.1"

  name   = "${var.project}-${var.environment}-sg-ecs"
  vpc_id = var.vpc_id

  ingress_with_cidr_blocks = [
    {
      from_port   = 0
      to_port     = 0
      protocol    = "-1"
      description = "Allow all traffic from VPC"
      cidr_blocks = data.aws_vpc.this.cidr_block
    }
  ]

  egress_rules = ["all-all"]
}

module "db" {
  source  = "terraform-aws-modules/security-group/aws"
  version = "~> 5.1"

  name   = "${var.project}-${var.environment}-sg-db"
  vpc_id = var.vpc_id

  ingress_with_source_security_group_id = [
    {
      description              = "ECS to RDS"
      rule                     = "postgresql-tcp"
      source_security_group_id = module.ecs.security_group_id
    },
  ]
}
