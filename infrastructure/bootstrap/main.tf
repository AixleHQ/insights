terraform {
  required_version = ">= 1.4"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.45"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = "db90"
      ManagedBy = "terraform"
    }
  }
}

resource "aws_s3_bucket" "tfstate" {
  bucket = "${var.project}-tf-bucket"
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "tflock" {
  name         = "${var.project}-tf-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

# =============================================================================
# Route53 Hosted Zone
# =============================================================================

resource "aws_route53_zone" "main" {
  name = var.domain
}

# =============================================================================
# ECR Repositories
# =============================================================================

module "ecr_api" {
  source = "../modules/ecr"
  name   = "${var.project}-${var.application}-api"
  environments_by_count = [
    { name = "staging", priority = 10, count = 10 },
    { name = "production", priority = 20, count = 20 },
  ]
}

module "ecr_web" {
  source = "../modules/ecr"
  name   = "${var.project}-${var.application}-web"
  environments_by_count = [
    { name = "staging", priority = 10, count = 10 },
    { name = "production", priority = 20, count = 20 },
  ]
}

module "ecr_temporal_worker" {
  source = "../modules/ecr"
  name   = "${var.project}-${var.application}-temporal-worker"
  environments_by_count = [
    { name = "staging", priority = 10, count = 10 },
    { name = "production", priority = 20, count = 20 },
  ]
}

module "ecr_keycloak" {
  source = "../modules/ecr"
  name   = "${var.project}-${var.application}-keycloak"
  environments_by_count = [
    { name = "staging", priority = 10, count = 10 },
    { name = "production", priority = 20, count = 20 },
  ]
}

# =============================================================================
# GitHub Actions OIDC
# =============================================================================

data "aws_caller_identity" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_deploy" {
  name = "${var.project}-github-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
          }
        }
      }
    ]
  })
}

resource "aws_iam_policy" "github_deploy" {
  name = "${var.project}-github-deploy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECR"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeRepositories",
          "ecr:ListImages",
          "ecr:DescribeImages",
        ]
        Resource = "*"
      },
      {
        Sid    = "ECS"
        Effect = "Allow"
        Action = [
          "ecs:ListClusters",
          "ecs:ListServices",
          "ecs:ListTasks",
          "ecs:ListTaskDefinitions",
          "ecs:DescribeClusters",
          "ecs:DescribeServices",
          "ecs:DescribeTasks",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition",
          "ecs:UpdateService",
          "ecs:RunTask",
          "ecs:StopTask",
          "ecs:ExecuteCommand",
        ]
        Resource = "*"
      },
      {
        Sid      = "PassRole"
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project}-*-ecs-role"
      },
      {
        Sid    = "Logs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "*"
      },
      {
        Sid    = "SSM"
        Effect = "Allow"
        Action = [
          "ssm:GetParameters",
          "ssm:GetParameter",
        ]
        Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project}/*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "github_deploy" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = aws_iam_policy.github_deploy.arn
}

# =============================================================================
# CI/CD VPC + GitHub Actions self-hosted runners (spot EC2 via Lambda scaling)
# =============================================================================

module "vpc_cicd" {
  count = var.enable_github_runners ? 1 : 0

  source  = "terraform-aws-modules/vpc/aws"
  version = "5.19.0"

  name = "${var.project}-vpc-cicd"

  cidr            = var.cicd_vpc.cidr
  azs             = var.cicd_vpc.azs
  private_subnets = var.cicd_vpc.private_subnets
  public_subnets  = var.cicd_vpc.public_subnets

  enable_nat_gateway     = true
  single_nat_gateway     = true
  one_nat_gateway_per_az = false

  enable_flow_log                                 = true
  create_flow_log_cloudwatch_iam_role             = true
  create_flow_log_cloudwatch_log_group            = true
  flow_log_traffic_type                           = "REJECT"
  flow_log_cloudwatch_log_group_retention_in_days = 365
}

module "github_runners" {
  count = var.enable_github_runners ? 1 : 0

  source = "../modules/github-runners"

  project = var.project
  region  = var.region

  vpc_id     = module.vpc_cicd[0].vpc_id
  subnet_ids = module.vpc_cicd[0].private_subnets

  github_app                  = var.github_app
  runners_maximum_count       = var.runners_maximum_count
  runner_instance_type        = var.runner_instance_type
  enable_organization_runners = var.enable_organization_runners
}
