# DB90 AWS Infrastructure

This document describes the AWS infrastructure provisioned by Terraform for the DB90 application.

## High-Level Overview

```
                          ┌─────────────────────────────────────────────┐
                          │                 Route53                     │
                          │   insights.example.com         │
                          │   auth-insights.example.com    │
                          │   temporal-insights.example.com│
                          └──────────────────┬──────────────────────────┘
                                             │
                          ┌──────────────────▼──────────────────────────┐
                          │        Application Load Balancer            │
                          │     (HTTPS termination, host-based routing) │
                          └──┬──────────────┬───────────────────┬───────┘
                             │              │                   │
                    ┌────────▼───┐  ┌───────▼────┐   ┌─────────▼──────┐
                    │  Web (SPA) │  │  Keycloak   │   │  Temporal UI   │
                    │  Nginx     │  │  Auth       │   │                │
                    └────────────┘  └────────────-┘   └────────────────┘
                             │
                    ┌────────▼───────────────────────────────────┐
                    │              Private Subnets                │
                    │                                             │
                    │  ┌─────┐ ┌───────┐ ┌────────┐ ┌──────────┐│
                    │  │ API │ │Sidekiq│ │Temporal│ │ Temporal  ││
                    │  │     │ │       │ │ Server │ │  Worker   ││
                    │  └──┬──┘ └───┬───┘ └────────┘ └──────────┘│
                    │     │        │                              │
                    └─────┼────────┼──────────────────────────────┘
                          │        │
              ┌───────────┼────────┼──────────┐
              │           │        │          │
        ┌─────▼───┐  ┌───▼────┐  ┌▼────────┐ │
        │Timescale│  │  RDS   │  │  Redis   │ │
        │ Cloud   │  │ Shared │  │ElastiCache│ │
        │(via VPC │  │(KC+    │  │          │ │
        │ peering)│  │Temporal)│  └──────────┘ │
        └─────────┘  └────────┘                │
                                    ┌──────────▼┐
                                    │ S3 Bucket  │
                                    │ raw-events │
                                    └────────────┘
```

## Networking

**VPC:** `10.10.0.0/16`

| Subnet Type | CIDRs | Purpose |
|---|---|---|
| Public | `10.10.1-3.0/24` | ALB, NAT Gateway |
| Private | `10.10.11-13.0/24` | ECS tasks |
| Database | `10.10.21-23.0/24` | RDS |
| ElastiCache | `10.10.31-33.0/24` | Redis |

A single NAT Gateway is used in staging to reduce costs. The VPC spans all available AZs in `us-east-2`.

**VPC Peering** to Timescale Cloud (`172.30.0.0/16`) provides private connectivity to the managed TimescaleDB instance.

### Security Groups

| Group | Inbound | Outbound |
|---|---|---|
| ALB | HTTP/HTTPS from `0.0.0.0/0` | All |
| ECS | All from VPC CIDR | All |
| DB | PostgreSQL (5432) from ECS SG | None |

## ECS Cluster

The cluster uses AWS Fargate with two capacity providers:

- **FARGATE** for services that need guaranteed capacity (API, Temporal, Keycloak)
- **FARGATE_SPOT** for cost-sensitive workloads (Web, Sidekiq, Temporal Worker, Temporal UI)

Each service is configured with `fargate_base` to control how many tasks run on standard Fargate vs Spot.

### Services

| Service | Image Source | CPU | Memory | Spot | Port | Purpose |
|---|---|---|---|---|---|---|
| api | ECR `db90-api` | 512 | 1024 | No | 3000 | Rails API |
| web | ECR `db90-web` | 256 | 512 | Yes | 80 | Nginx + React SPA |
| sidekiq | ECR `db90-api` | 512 | 1024 | Yes | - | Background jobs |
| temporal | `temporalio/auto-setup` | 512 | 1024 | No | 7233 | Workflow orchestration |
| temporal-worker | ECR `db90-temporal-worker` | 256 | 512 | Yes | - | Workflow execution |
| temporal-ui | `temporalio/ui` | 256 | 512 | Yes | 8080 | Temporal dashboard |
| keycloak | ECR `db90-keycloak` | 512 | 1024 | No | 8080 | Identity provider |

Note: `sidekiq` uses the same Docker image as `api`.

### Service Discovery

Services communicate internally via AWS Cloud Map (private DNS namespace `{env}-db90.local`):

- `api.staging-db90.local:3000`
- `temporal.staging-db90.local:7233`
- `keycloak.staging-db90.local:8080`

The Web container proxies API requests to the API service via service discovery. The API connects to Temporal and Keycloak using these internal DNS names.

### Autoscaling

All services use Application Auto Scaling with target tracking policies:

- CPU target: 70%
- Memory target: 70%
- Scale-in cooldown: 300s
- Scale-out cooldown: 60s

## Load Balancer

An internet-facing ALB terminates HTTPS using an ACM certificate (covers all three domains). HTTP traffic is redirected to HTTPS.

| Priority | Host | Target |
|---|---|---|
| 10 | `insights.example.com` | Web (port 80) |
| 11 | `auth-insights.example.com` | Keycloak (port 8080) |
| 12 | `temporal-insights.example.com` | Temporal UI (port 8080) |

Health check paths: `/up` (web), `/realms/master` (keycloak), `/` (temporal-ui).

## Databases

### Timescale Cloud (application data)

The primary application database is a managed TimescaleDB instance hosted on Timescale Cloud. It's connected to the VPC via VPC peering and stores all Rails application data (users, organizations, projects, events, etc.).

### RDS PostgreSQL 17 (shared, internal services)

A single `db.t3.micro` RDS instance hosts databases for Keycloak and Temporal. It runs in the database subnets with encryption enabled. Storage auto-scales from 10 GB up to 20 GB.

Deletion protection is enabled in production and disabled in staging.

### ElastiCache Redis 7.1

A `cache.t3.micro` Redis node provides caching, Sidekiq job queues, and Rails session storage. At-rest encryption is enabled. The `maxmemory-policy` is set to `noeviction`.

## Storage

### S3

| Bucket | Purpose | Lifecycle |
|---|---|---|
| `db90-{env}-raw-events` | Raw event data quarantine | 3-day expiration |

The bucket has AES256 encryption, versioning disabled, and public access blocked. The ECS task role has full read/write access.

### ECR Repositories

| Repository | Lifecycle |
|---|---|
| `db90-api` | Keep 10 staging + 20 prod images |
| `db90-web` | Keep 10 staging + 20 prod images |
| `db90-temporal-worker` | Keep 10 staging + 20 prod images |
| `db90-keycloak` | Keep 10 staging + 20 prod images |

## Secrets Management

All secrets are stored in AWS Systems Manager Parameter Store under the prefix `/{project}/{environment}/`. The ECS task execution role has access to read these parameters and decrypt them via KMS.

| Parameter | Source |
|---|---|
| `SECRET_KEY_BASE` | Auto-generated (128 chars) |
| `RAW_EVENT_ENCRYPTION_KEY` | Auto-generated (64 chars) |
| `KEYCLOAK_ADMIN_PASSWORD` | Auto-generated (24 chars) |
| `DATABASE_PASSWORD` | From `terraform.tfvars` |
| `SHARED_DB_PASSWORD` | From `terraform.tfvars` |
| `GOOGLE_CLIENT_ID` | From `terraform.tfvars` |
| `GOOGLE_CLIENT_SECRET` | From `terraform.tfvars` |
| `ACTIVE_RECORD_ENCRYPTION_*` | Auto-generated |
| `DATABASE_URL` | Constructed from Timescale Cloud config |
| `REDIS_URL` | Constructed from ElastiCache endpoint |

## IAM

A single ECS task role (`db90-{env}-ecs-role`) is used for both task execution and task runtime. It has:

- **AmazonECSTaskExecutionRolePolicy** (pulling ECR images, writing CloudWatch logs)
- **SSM Parameter Store** read access (`ssm:GetParameters`, `kms:Decrypt`)
- **S3** read/write access to the raw-events bucket
- **ECS Exec** permissions (`ssmmessages:*`) for interactive debugging

## Monitoring

### CloudWatch Logs

Each ECS service has its own log group (`db90-{env}-{service}`) with configurable retention (30 days in staging).

### CloudWatch Dashboard

A dashboard named `db90-{env}-monitoring` provides four widget groups:

1. **App Services** CPU and Memory (API, Web, Sidekiq)
2. **Temporal & Keycloak** CPU and Memory
3. **ALB** request count, response time, 5XX errors
4. **Redis** CPU utilization, memory usage

## Terraform Organization

### State Management

- **Backend:** S3 bucket `db90-tf-bucket` with DynamoDB lock table `db90-tf-lock`
- **Bootstrap state:** `db90/us-east-2/bootstrap/terraform.tfstate` (committed `bootstrap/backend.tf`)
- **Bootstrap variables:** `s3://db90-tf-bucket/bootstrap/terraform.tfvars` (local `bootstrap/terraform.tfvars`, gitignored)
- **Environment state:** `db90/us-east-2/terraform.tfstate` with workspaces `staging` / `prod` (never use `default`)
- **Variables:** stored encrypted in S3 and loaded automatically by Terragrunt

### Module Structure

```
infrastructure/
├── bootstrap/              # One-time setup: S3 bucket, DynamoDB, Route53, ECR repos, CI runners VPC
│   └── backend.tf          # Remote state (committed)
├── common/terragrunt.hcl   # Shared backend configuration
├── terragrunt.hcl          # Workspace-based variable loading
├── main.tf                 # Root module: all resources and service definitions
├── variables.tf            # Input variable definitions
├── outputs.tf              # Output values
├── Dockerfile              # Terraform/Terragrunt container
├── docker-compose.yml      # Infrastructure shell container
├── Makefile                # Helper commands (shell, push/pull vars, unlock, fmt)
├── tfvars/
│   └── staging/terraform.tfvars
└── modules/
    ├── github-runners/     # Wrapper: GitHub Actions spot runners (bootstrap only)
    ├── network/            # VPC, subnets, NAT gateway
    ├── security_groups/    # ALB, ECS, DB security groups
    ├── roles/              # IAM roles and policies
    ├── ecs_cluster/        # ECS cluster with Fargate providers
    ├── ecs_task_definition/# Task definition resource
    ├── ecs_service/        # ECS service with LB and service discovery
    ├── ecs_autoscaling/    # Target tracking autoscaling
    ├── app/                # Composite: task def + service + autoscaling + logs
    ├── service_discovery/  # Cloud Map namespace and services
    ├── certificate/        # ACM certificate with DNS validation
    ├── alb/                # ALB, listeners, target groups, routing rules
    ├── ecr/                # ECR repositories with lifecycle policies
    ├── s3/                 # S3 buckets with encryption and lifecycle
    ├── cloudwatch/         # Log groups
    ├── cloudwatch_dashboard/ # Monitoring dashboard
    ├── variables/          # Map-to-list helper
    └── scripts/
        └── ecs-task-definition.sh  # Resolves current image tag from ECS
```
