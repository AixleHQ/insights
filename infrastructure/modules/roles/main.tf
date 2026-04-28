data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "task_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "secrets" {
  name = "${var.project}-${var.environment}-task-policy-secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AccessSecrets"
        Effect = "Allow"
        Action = [
          "ssm:GetParameters",
          "kms:Decrypt",
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.ssm_key_prefix}*",
          "arn:aws:kms:${var.region}:${data.aws_caller_identity.current.account_id}:key/*",
          "arn:aws:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:${var.ssm_key_prefix}*",
        ]
      },
    ]
  })
}

resource "aws_iam_policy" "ecs_exec" {
  name = "${var.project}-${var.environment}-task-policy-ecs-exec"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AccessExec"
        Effect = "Allow"
        Action = [
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel"
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_policy" "s3" {
  name   = "${var.project}-${var.environment}-task-policy-s3"
  policy = data.aws_iam_policy_document.s3.json
}

data "aws_iam_policy_document" "s3" {
  statement {
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = var.bucket_arns
  }

  statement {
    effect = "Allow"
    actions = [
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:PutObject",
      "s3:PutObjectAcl",
    ]
    resources = [for bucket in var.bucket_arns : "${bucket}/*"]
  }
}

resource "aws_iam_role" "ecs" {
  name               = "${var.project}-${var.environment}-ecs-role"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

resource "aws_iam_role_policy_attachment" "secrets" {
  role       = aws_iam_role.ecs.name
  policy_arn = aws_iam_policy.secrets.arn
}

resource "aws_iam_role_policy_attachment" "ecs_exec" {
  role       = aws_iam_role.ecs.name
  policy_arn = aws_iam_policy.ecs_exec.arn
}

resource "aws_iam_role_policy_attachment" "s3" {
  role       = aws_iam_role.ecs.name
  policy_arn = aws_iam_policy.s3.arn
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
