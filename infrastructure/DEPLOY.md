# DB90 AWS Infrastructure Deployment

## Prerequisites

1. AWS account with admin access
2. AWS CLI configured locally
3. Docker installed
4. Domain registered and Route53 hosted zone created

## Initial Setup (One-time)

### 1. Bootstrap AWS Resources

Bootstrap creates the S3 state bucket, DynamoDB lock table, and ECR repositories.

```bash
cd infrastructure/bootstrap
terraform init
terraform apply
```

### 2. Configure GitHub Actions Secrets

Create an IAM OIDC provider for GitHub Actions and a deploy role. Then set these secrets in GitHub:

| Secret | Description |
|--------|-------------|
| `AWS_ACCOUNT_ID` | AWS account ID |
| `AWS_DEPLOY_ROLE_ARN` | IAM role ARN for GitHub Actions OIDC |
| `ECS_SUBNETS` | Comma-separated private subnet IDs |
| `ECS_SECURITY_GROUPS` | Comma-separated ECS security group IDs |

### 3. Set SSM Parameters

After the first `terragrunt apply`, update SSM parameters with real values:

```bash
aws ssm put-parameter --name "/db90/staging/SECRET_KEY_BASE" --type SecureString --value "$(openssl rand -hex 64)" --overwrite
aws ssm put-parameter --name "/db90/staging/RAILS_MASTER_KEY" --type SecureString --value "<your-master-key>" --overwrite
aws ssm put-parameter --name "/db90/staging/RAW_EVENT_ENCRYPTION_KEY" --type SecureString --value "$(openssl rand -hex 32)" --overwrite
aws ssm put-parameter --name "/db90/staging/KEYCLOAK_ADMIN_PASSWORD" --type SecureString --value "<strong-password>" --overwrite
aws ssm put-parameter --name "/db90/staging/RDS_PASSWORD" --type SecureString --value "<rds-master-password>" --overwrite
```

#### OAuth Integration Credentials

Each integration OAuth provider requires **one OAuth App registered for the entire DB90 platform** — not one per organization. All organizations share the same `client_id`/`client_secret`; each organization gets its own `access_token` after completing the OAuth flow, stored in `organization_connectors`.

| Provider | Register at | SSM parameters |
|----------|------------|----------------|
| GitHub | github.com → Settings → Developer settings → OAuth Apps | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| GitLab | gitlab.com → User Settings → Applications | `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET` |
| Bitbucket | bitbucket.org → Workspace Settings → OAuth consumers | `BITBUCKET_CLIENT_ID`, `BITBUCKET_CLIENT_SECRET` |
| Jira / Atlassian | developer.atlassian.com → OAuth 2.0 | `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET` |
| Linear | linear.app → Settings → API → OAuth applications | `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET` |

Set the **Authorization callback URL** to `https://<app_domain>/integrations/callback` when registering each app.

Once you have the credentials, write them to SSM:

```bash
aws ssm put-parameter --name "/db90/staging/GITHUB_CLIENT_ID"     --type SecureString --value "<id>"     --overwrite
aws ssm put-parameter --name "/db90/staging/GITHUB_CLIENT_SECRET"  --type SecureString --value "<secret>" --overwrite

# Repeat for each provider you want to enable. Use the same pattern:
# aws ssm put-parameter --name "/db90/staging/<PROVIDER>_CLIENT_ID"     --type SecureString --value "<id>"     --overwrite
# aws ssm put-parameter --name "/db90/staging/<PROVIDER>_CLIENT_SECRET"  --type SecureString --value "<secret>" --overwrite
```

Then update `tfvars/staging/terraform.tfvars` with the real values (replacing `"pending"`) and run `make push_vars` to keep Terraform state in sync. Finally, force a new ECS deployment so the containers pick up the updated secrets:

```bash
aws ecs update-service --cluster db90-staging-cluster --service db90-staging-api --force-new-deployment
aws ecs update-service --cluster db90-staging-cluster --service db90-staging-sidekiq --force-new-deployment
aws ecs update-service --cluster db90-staging-cluster --service db90-staging-temporal-worker --force-new-deployment
```

> **Providers with `"pending"` credentials are safe to deploy** — the API returns a clear `503 { code: "integration_not_configured" }` and the UI shows "This integration is not available in this environment. Please contact your administrator." No broken OAuth URLs are generated.

### 4. Update Domain Placeholders

After bootstrap, copy the `zone_id` output into `tfvars/staging/terraform.tfvars` and `tfvars/production/terraform.tfvars` (replace `CHANGE_ME_AFTER_BOOTSTRAP`).

## First Staging Deployment

### 1. Open Infrastructure Shell

```bash
cd infrastructure
make shell
```

### 2. Initialize and Select Workspace

```bash
terragrunt init
terraform workspace new staging
terraform workspace select staging
```

### 3. Pull/Push Variables

```bash
# Upload staging vars to S3 (first time)
make push_vars

# Subsequent runs: pull latest from S3
make pull_vars
```

### 4. Plan and Apply

```bash
terragrunt plan -var-file=tfvars/staging/terraform.tfvars
terragrunt apply -var-file=tfvars/staging/terraform.tfvars
```

### 5. Build and Push Initial Images

```bash
# From the project root (not the infrastructure shell)
export AWS_ACCOUNT_ID=<your-account-id>
export AWS_REGION=us-east-2
export ECR_REGISTRY=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

docker build -f Dockerfile.api -t $ECR_REGISTRY/db90-api:staging-latest .
docker build -f Dockerfile.web -t $ECR_REGISTRY/db90-web:staging-latest .
docker build -f Dockerfile.temporal-worker -t $ECR_REGISTRY/db90-temporal-worker:staging-latest .

docker push $ECR_REGISTRY/db90-api:staging-latest
docker push $ECR_REGISTRY/db90-web:staging-latest
docker push $ECR_REGISTRY/db90-temporal-worker:staging-latest
```

### 6. Import Keycloak Realm

After the Keycloak ECS service is running, import the realm configuration:

```bash
# Use ECS exec to access Keycloak container
CLUSTER=db90-staging-cluster
TASK_ID=$(aws ecs list-tasks --cluster $CLUSTER --service-name db90-staging-keycloak --query 'taskArns[0]' --output text | awk -F'/' '{print $NF}')

aws ecs execute-command \
  --cluster $CLUSTER \
  --task $TASK_ID \
  --container keycloak \
  --interactive \
  --command "/opt/keycloak/bin/kc.sh import --file /tmp/realm-staging.json"
```

Alternatively, use the Keycloak Admin Console at `https://auth-insights.example.com` to import the realm manually.

### 6b. Verify Temporal UI

Once Temporal and Temporal UI services are running, the Temporal Web UI is available at `https://temporal-insights.example.com`. Use it to monitor workflow executions, view task queues, and debug workers.

### 7. Run Database Migrations

```bash
TASK_DEF_ARN=$(aws ecs describe-task-definition --task-definition db90-staging-api --query 'taskDefinition.taskDefinitionArn' --output text)

aws ecs run-task \
  --cluster db90-staging-cluster \
  --task-definition $TASK_DEF_ARN \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<subnet-ids>],securityGroups=[<sg-ids>],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides": [{"name": "api", "command": ["bundle", "exec", "rails", "db:migrate"]}]}'
```

### 8. Seed Database

```bash
aws ecs run-task \
  --cluster db90-staging-cluster \
  --task-definition $TASK_DEF_ARN \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<subnet-ids>],securityGroups=[<sg-ids>],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides": [{"name": "api", "command": ["bundle", "exec", "rails", "db:seed"]}]}'
```

## CI/CD Flow

After initial setup, deployments are automated:

- Push to `staging` branch -> deploys to staging
- Push to `main` branch -> deploys to production

The deploy workflow (`.github/workflows/deploy.yml`):
1. Builds Docker images
2. Pushes to ECR
3. Runs database migrations via ECS RunTask
4. Updates each ECS service with new task definition
5. Waits for service stability

## Useful Commands

```bash
# ECS exec into API container
aws ecs execute-command --cluster db90-staging-cluster --task <task-id> --container api --interactive --command "/bin/bash"

# View service logs
aws logs tail db90-staging-api --follow

# Force redeploy a service
aws ecs update-service --cluster db90-staging-cluster --service db90-staging-api --force-new-deployment

# Force redeploy Temporal UI (after config/image update)
aws ecs update-service --cluster db90-staging-cluster --service db90-staging-temporal-ui --force-new-deployment
```
