output "runners" {
  value = {
    lambda_syncer_name = module.github-runner.binaries_syncer.lambda.function_name
  }
}

output "webhook_endpoint" {
  value = module.github-runner.webhook.endpoint
}

output "webhook_secret" {
  sensitive = true
  value     = var.github_app.webhook_secret
}

output "runner_role_name" {
  value = module.github-runner.runners.role_runner.name
}
