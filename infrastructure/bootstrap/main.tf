terraform {
  required_version = ">= 1.4"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.45"
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
    { name = "prod", priority = 20, count = 20 },
  ]
}

module "ecr_web" {
  source = "../modules/ecr"
  name   = "${var.project}-${var.application}-web"
  environments_by_count = [
    { name = "staging", priority = 10, count = 10 },
    { name = "prod", priority = 20, count = 20 },
  ]
}

module "ecr_temporal_worker" {
  source = "../modules/ecr"
  name   = "${var.project}-${var.application}-temporal-worker"
  environments_by_count = [
    { name = "staging", priority = 10, count = 10 },
    { name = "prod", priority = 20, count = 20 },
  ]
}

module "ecr_keycloak" {
  source = "../modules/ecr"
  name   = "${var.project}-${var.application}-keycloak"
  environments_by_count = [
    { name = "staging", priority = 10, count = 10 },
    { name = "prod", priority = 20, count = 20 },
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
        Sid    = "PassRole"
        Effect = "Allow"
        Action = "iam:PassRole"
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
