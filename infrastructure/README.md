# DB90 Infrastructure Operations

Day-to-day Terraform operations and environment setup guide.

## Prerequisites

- AWS CLI configured with MFA access to the `db90` account (`900631658306`)
- Docker installed (for the infrastructure shell container)
- AWS credentials exported as environment variables

## Daily Operations

### Opening the Infrastructure Shell

All Terraform/Terragrunt commands run inside a Docker container with pre-installed tools and helpful aliases.

```bash
cd infrastructure
make shell
```

Inside the container, these aliases are available:

| Alias | Command |
|---|---|
| `t` | `terragrunt` |
| `ti` | `terragrunt init` |
| `tp` | `terragrunt plan` |
| `ta` | `terragrunt apply` |
| `tw` | `terragrunt workspace` |
| `tws` | `terragrunt workspace select` |

### Selecting a Workspace

Terraform workspaces separate staging and production state. Always verify your workspace before running commands.

```bash
terraform workspace list
terraform workspace select staging
```

The shell prompt shows the current workspace.

### Plan and Apply

Terragrunt automatically loads the correct `tfvars` file based on the active workspace:

```bash
# Preview changes
terragrunt plan

# Apply changes
terragrunt apply
```

After a successful `apply`, Terragrunt automatically uploads the tfvars file to S3 via an `after_hook`.

### Managing Variables

Variable files live in `tfvars/{workspace}/terraform.tfvars` and are synced to S3 for shared access.

```bash
# Download latest variables from S3
make pull_vars

# Upload local variables to S3
make push_vars
```

### Unlocking State

If a Terraform run was interrupted and left a stale lock:

```bash
make unlock
```

### Formatting

```bash
make fmt
```

## Setting Up a New Environment

### Step 1: Bootstrap (one-time, shared across environments)

Bootstrap creates the S3 state bucket, DynamoDB lock table, Route53 hosted zone, ECR repositories, GitHub OIDC deploy role, and optionally **self-hosted GitHub Actions runners** on EC2 Spot.

State is stored remotely in the same bucket the stack creates (`db90-tf-bucket`, key `db90/us-east-2/bootstrap/terraform.tfstate`). Local `terraform.tfstate` files are gitignored.

**Blank AWS account (bucket does not exist yet):**

```bash
cd infrastructure/bootstrap
make init-local    # local state — required once so apply can create the S3 bucket
terraform apply
make migrate-state # copy state to S3; confirm "yes" when prompted
```

**Existing bootstrap (local state file on disk, bucket already exists):**

```bash
cd infrastructure/bootstrap
make migrate-state
# Remove local state from git if it was committed: git rm --cached terraform.tfstate terraform.tfstate.backup
```

**Day-to-day (remote state already configured):**

```bash
cd infrastructure/bootstrap
make pull_vars   # optional — sync secrets from S3 when setting up a new machine
make init
make plan
make apply       # uploads terraform.tfvars to S3 after apply
```

Bootstrap variables (`bootstrap/terraform.tfvars`, gitignored) sync to `s3://db90-tf-bucket/bootstrap/terraform.tfvars` via `make push_vars` / `make pull_vars` — same pattern as env tfvars under `tfvars/{workspace}/`.

Save the output values:
- `zone_id` goes into `tfvars/{env}/terraform.tfvars`
- `nameservers` must be configured at your domain registrar

#### GitHub Actions self-hosted runners (optional)

Runners use the [`github-aws-runners/github-runner/aws`](https://github.com/github-aws-runners/terraform-aws-github-runner) module (same pattern as threpo-infra `common/`). Spot EC2 instances scale via Lambda; a dedicated VPC (`10.200.0.0/16`) keeps CI traffic separate from staging/prod app VPCs. Runner user-data installs `make`, `gcc`, `gcc-c++`, and `python3` for native npm modules (e.g. `better-sqlite3`).

1. Create a [GitHub App](https://github-aws-runners.github.io/terraform-aws-github-runner/getting-started/#setup-github-app-part-1) with Actions/Checks/Metadata (read) and Self-hosted runners (read/write). For repo-level runners also grant Administration read/write.
2. Download Lambda artifacts (required once before apply):

```bash
make download-runner-lambdas
```

3. Copy `bootstrap/terraform.tfvars.example` → `bootstrap/terraform.tfvars`, set `enable_github_runners = true` and fill `github_app` credentials.
4. Apply bootstrap, then copy outputs into the GitHub App webhook settings:

```bash
terraform output github_runners_webhook_endpoint
terraform output -raw github_runners_webhook_secret
```

5. Install the GitHub App on `dualboot-partners/db90-rails` (or enable org runners via `enable_organization_runners = true`).
6. Switch workflow jobs to `runs-on: self-hosted` when ready (OIDC deploy role is unchanged).

Runners are **disabled by default** (`enable_github_runners = false`) so existing bootstrap applies stay unchanged.

### Step 2: Create the Workspace

```bash
cd infrastructure
make shell

# Inside container:
terragrunt init
terraform workspace new <environment>   # e.g. "prod"
terraform workspace select <environment>
```

### Step 3: Create the Variables File

Copy the staging tfvars as a template:

```bash
cp tfvars/staging/terraform.tfvars tfvars/<environment>/terraform.tfvars
```

Update these values for the new environment:

| Variable | What to change |
|---|---|
| `environment` | `"prod"` |
| `app_domain` | `"db90.example.com"` |
| `kc_domain` | `"auth.db90.example.com"` |
| `temporal_ui_domain` | `"temporal.db90.example.com"` |
| `app_database` | New Timescale Cloud instance credentials |
| `shared_database.password` | Generate a new password |
| `network.cidr` | Use a different CIDR if needed (e.g. `10.20.0.0/16`) |
| `network.single_nat_gateway` | Set to `false` for production (multi-AZ NAT) |
| `ecs_service` | Adjust CPU/memory/counts for production load |
| `ssm_key_prefix` | `"db90/prod"` |

### Step 4: Plan and Apply

```bash
terragrunt plan
terragrunt apply
```

This creates the full infrastructure: VPC, ALB, ECS cluster, RDS, Redis, S3, CloudWatch, IAM roles, and all ECS services.

### Step 5: Build and Push Initial Images

From the project root (not the infrastructure shell):

```bash
make staging-build    # or: make prod-build
```

This uses `ecs_helper build_and_push` to build all Docker images and push them to ECR with the correct tags.

### Step 6: Deploy Services

```bash
make staging-deploy   # or: make prod-deploy
```

This uses `ecs_helper deploy` to update all ECS task definitions with the pushed images and wait for service stability.

### Step 7: Run Database Migrations

```bash
make staging-exec-api
# Inside the container:
bundle exec rails db:create
bundle exec rails db:migrate
bundle exec rails db:seed
```

### Step 8: Verify

- Application: `https://insights.example.com`
- Keycloak: `https://auth-insights.example.com`
- Temporal UI: `https://temporal-insights.example.com`

## CI/CD

Deployments are automated via GitHub Actions (`.github/workflows/deploy.yml`):

- Push to `staging` branch deploys to staging
- Push to `main` branch deploys to production

The pipeline:
1. Builds Docker images using `ecs_helper build_and_push`
2. Runs database migrations using `ecs_helper run_command`
3. Deploys all services using `ecs_helper deploy`

### Required GitHub Secrets

| Secret | Description | Where to get |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | IAM role ARN for GitHub Actions OIDC | `terraform output github_deploy_role_arn` in `bootstrap/` |
| `AWS_REGION` | AWS region | `us-east-2` |

The OIDC provider and deploy role are created by the bootstrap module. After `terraform apply` in `bootstrap/`, copy the `github_deploy_role_arn` output into GitHub repository settings at **Settings > Secrets and variables > Actions**.

### GHCR base image mirrors

Self-hosted runners hit Docker Hub rate limits when many jobs pull the same base images. CI service images and Dockerfile `FROM` lines use mirrors under `ghcr.io/dualboot-partners/db90-rails/*`, published by [`.github/workflows/ghcr-mirror-base-images.yml`](../.github/workflows/ghcr-mirror-base-images.yml).

**One-time bootstrap:** push changes under `docker/ghcr-mirrors/` (triggers the workflow automatically), or after merge to `develop` use Actions → **Mirror base images to GHCR** → **Run workflow**. Until the workflow file is on the default branch, it does not appear in the left sidebar — only `workflow_dispatch` from the UI requires that; push and schedule still work on feature branches.

Mirror definitions live in [`docker/ghcr-mirrors/`](../docker/ghcr-mirrors/). CI jobs log in to GHCR with `GITHUB_TOKEN` (`packages: read`) before `docker compose` / `docker build`.

## Manual Deployment

For manual deployments outside of CI/CD, use the toolbox container which has `ecs_helper`, Docker, and Git:

```bash
# Build and push a single image
make staging-build-keycloak

# Deploy a single service
make staging-deploy-keycloak

# Build and push all images, then deploy everything
make staging-build
make staging-deploy
```

AWS credentials must be exported as environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`).

## ECS Operations

### Exec into a Running Container

```bash
make staging-exec-api
make staging-exec-keycloak
make staging-exec-temporal
make prod-exec-api
```

### View Logs

```bash
make staging-logs-api
make staging-logs-keycloak
make staging-logs-temporal
```

### Toolbox Shell

For ad-hoc `ecs_helper` or `aws` commands:

```bash
make toolbox-shell
```

## Troubleshooting

### ECS task fails to start

Check the CloudWatch logs for the service:

```bash
make staging-logs-<service>
```

Common causes:
- Image not found in ECR (run `make staging-build-<service>` first)
- Incorrect image tag in task definition (redeploy with `make staging-deploy-<service>`)
- Health check failing (check the health check path in the ALB target group)
- Secrets not found in SSM (verify parameters exist at `/{project}/{env}/`)

### Terraform state locked

```bash
cd infrastructure
make shell
make unlock
```

### Service not reachable

1. Check the ECS service has running tasks (desired count > 0)
2. Check the ALB target group shows healthy targets
3. Check the security group allows traffic from the ALB
4. Check Route53 A record points to the ALB
