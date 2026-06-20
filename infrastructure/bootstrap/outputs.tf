output "state_bucket" {
  value = aws_s3_bucket.tfstate.id
}

output "lock_table" {
  value = aws_dynamodb_table.tflock.name
}

output "zone_id" {
  value = aws_route53_zone.main.zone_id
}

output "nameservers" {
  value       = aws_route53_zone.main.name_servers
  description = "Add these as NS record for db90.example.com in the parent zone"
}

output "ecr_api_url" {
  value = module.ecr_api.url
}

output "ecr_web_url" {
  value = module.ecr_web.url
}

output "ecr_temporal_worker_url" {
  value = module.ecr_temporal_worker.url
}

output "ecr_keycloak_url" {
  value = module.ecr_keycloak.url
}

output "github_deploy_role_arn" {
  value       = aws_iam_role.github_deploy.arn
  description = "Use this as AWS_DEPLOY_ROLE_ARN in GitHub Actions secrets"
}

output "cicd_vpc_id" {
  value       = try(module.vpc_cicd[0].vpc_id, null)
  description = "VPC ID for CI/CD runners (null when enable_github_runners = false)"
}

output "github_runners_webhook_endpoint" {
  value       = try(module.github_runners[0].webhook_endpoint, null)
  description = "GitHub App webhook URL — configure in the GitHub App after apply"
}

output "github_runners_webhook_secret" {
  sensitive   = true
  value       = try(module.github_runners[0].webhook_secret, null)
  description = "GitHub App webhook secret (same as github_app.webhook_secret in tfvars)"
}

output "github_runners_role_name" {
  value       = try(module.github_runners[0].runner_role_name, null)
  description = "IAM role attached to runner EC2 instances"
}
