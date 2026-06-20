# https://github-aws-runners.github.io/terraform-aws-github-runner/getting-started/#setup-guide
module "github-runner" {
  source  = "github-aws-runners/github-runner/aws"
  version = "6.5.5"

  aws_region = var.region
  vpc_id     = var.vpc_id
  subnet_ids = var.subnet_ids

  prefix = "${var.project}-gh-ci-${var.region}"

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = var.github_app.webhook_secret
  }

  webhook_lambda_zip                = "${path.module}/lambdas-download/webhook.zip"
  runner_binaries_syncer_lambda_zip = "${path.module}/lambdas-download/runner-binaries-syncer.zip"
  runners_lambda_zip                = "${path.module}/lambdas-download/runners.zip"
  enable_job_queued_check           = true

  enable_organization_runners = var.enable_organization_runners

  create_service_linked_role_spot       = true
  enable_ssm_on_runners                 = true
  enable_user_data_debug_logging_runner = true

  # Native npm modules (e.g. better-sqlite3 in @aixle/insights) need a C toolchain on the host.
  userdata_pre_install = <<-EOF
    install_with_retry make gcc gcc-c++ python3
  EOF

  delay_webhook_event       = 5
  runners_maximum_count     = var.runners_maximum_count
  instance_types            = [var.runner_instance_type]
  logging_retention_in_days = 365

  block_device_mappings = [
    {
      volume_size = 60
    }
  ]

  eventbridge = {
    enable = false
  }
}

module "webhook_github_app" {
  source     = "github-aws-runners/github-runner/aws//modules/webhook-github-app"
  version    = "6.5.5"
  depends_on = [module.github-runner]

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = var.github_app.webhook_secret
  }
  webhook_endpoint = module.github-runner.webhook.endpoint
}

resource "aws_cloudwatch_metric_alarm" "lambda_syncer_errors" {
  alarm_name          = "${var.project}-gh-ci-${var.region}-syncer-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert when Lambda function ${module.github-runner.binaries_syncer.lambda.function_name} errors exceed threshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = module.github-runner.binaries_syncer.lambda.function_name
  }

  tags = {
    Name = "${var.project}-gh-ci-${var.region}-syncer-errors"
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_webhook_errors" {
  alarm_name          = "${var.project}-gh-ci-${var.region}-webhook-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert when Lambda function ${module.github-runner.webhook.lambda.function_name} errors exceed threshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = module.github-runner.webhook.lambda.function_name
  }

  tags = {
    Name = "${var.project}-gh-ci-${var.region}-webhook-errors"
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_runners_errors" {
  alarm_name          = "${var.project}-gh-ci-${var.region}-runners-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert when Lambda function ${var.project}-gh-ci-${var.region}-runners errors exceed threshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = "${var.project}-gh-ci-${var.region}-runners"
  }

  tags = {
    Name = "${var.project}-gh-ci-${var.region}-runners-errors"
  }
}
