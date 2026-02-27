resource "aws_cloudwatch_log_group" "log_group" {
  name              = "${var.project}-${var.environment}-${var.name}"
  retention_in_days = var.logs_retention_in_days
}
