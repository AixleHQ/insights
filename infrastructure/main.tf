locals {
  ssm_prefix       = var.ssm_key_prefix
  namespace_name   = "${var.environment}-${var.project}.local"
  app_service_name = "${var.project}-${var.environment}"
}

# =============================================================================
# Networking
# =============================================================================

module "network" {
  source = "./modules/network"

  environment         = var.environment
  cidr                = var.network.cidr
  public_subnets      = var.network.public_subnets
  private_subnets     = var.network.private_subnets
  database_subnets    = var.network.database_subnets
  elasticache_subnets = var.network.elasticache_subnets
  single_nat_gateway  = var.network.single_nat_gateway
}

# =============================================================================
# Security Groups
# =============================================================================

module "security_groups" {
  source = "./modules/security_groups"

  project     = var.project
  environment = var.environment
  vpc_id      = module.network.self.vpc_id
}

# =============================================================================
# IAM Roles
# =============================================================================

module "roles" {
  source = "./modules/roles"

  region         = var.region
  project        = var.project
  environment    = var.environment
  ssm_key_prefix = local.ssm_prefix
  bucket_arns    = [module.s3_raw_events.bucket_arn]
}

# =============================================================================
# ECS Cluster
# =============================================================================

module "ecs_cluster" {
  source = "./modules/ecs_cluster"

  project     = var.project
  environment = var.environment
}

# =============================================================================
# Service Discovery
# =============================================================================

module "service_discovery" {
  source = "./modules/service_discovery"

  project        = var.project
  environment    = var.environment
  vpc_id         = module.network.self.vpc_id
  namespace_name = local.namespace_name

  services = {
    api = {
      dns_ttl           = 10
      failure_threshold = 1
    }
    temporal = {
      dns_ttl           = 10
      failure_threshold = 1
    }
    keycloak = {
      dns_ttl           = 10
      failure_threshold = 1
    }
  }
}

# =============================================================================
# ACM Certificate
# =============================================================================

module "certificate" {
  source = "./modules/certificate"

  domain            = var.app_domain
  zone_id           = var.zone_id
  alternative_names = [var.kc_domain, var.temporal_ui_domain]
}

# =============================================================================
# ALB
# =============================================================================

module "alb" {
  source = "./modules/alb"

  project     = var.project
  environment = var.environment
  name        = "main"

  alb_name        = "${var.project}-${var.environment}-alb"
  subnets         = module.network.self.public_subnets
  vpc_id          = module.network.self.vpc_id
  security_groups = [module.security_groups.alb.security_group_id]
  certificate_arn = module.certificate.arn
  app_hostnames   = [var.app_domain]
  health_check_path = "/up"

  target_groups = {
    "${var.project}-${var.environment}-web" = {
      health_check_path = "/up"
    }
    "${var.project}-${var.environment}-kc" = {
      health_check_path                = "/realms/master"
      health_check_interval            = 30
      health_check_unhealthy_threshold = 5
    }
    "${var.project}-${var.environment}-temporal-ui" = {
      health_check_path = "/"
    }
  }

  listener_rules = [
    {
      priority = 10
      hosts    = [var.app_domain]
      service  = "${var.project}-${var.environment}-web"
    },
    {
      priority = 11
      hosts    = [var.kc_domain]
      service  = "${var.project}-${var.environment}-kc"
    },
    {
      priority = 12
      hosts    = [var.temporal_ui_domain]
      service  = "${var.project}-${var.environment}-temporal-ui"
      auth     = true
    },
  ]

  oidc_issuer                 = "https://${var.kc_domain}/realms/db90"
  oidc_authorization_endpoint = "https://${var.kc_domain}/realms/db90/protocol/openid-connect/auth"
  oidc_token_endpoint         = "https://${var.kc_domain}/realms/db90/protocol/openid-connect/token"
  oidc_user_info_endpoint     = "https://${var.kc_domain}/realms/db90/protocol/openid-connect/userinfo"
  oidc_client_id              = var.alb_oidc_client_id
  oidc_client_secret          = var.alb_oidc_client_secret
}

# =============================================================================
# Route53
# =============================================================================

resource "aws_route53_record" "app" {
  zone_id = var.zone_id
  name    = var.app_domain
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "keycloak" {
  zone_id = var.zone_id
  name    = var.kc_domain
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "temporal_ui" {
  zone_id = var.zone_id
  name    = var.temporal_ui_domain
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

# =============================================================================
# S3 - Raw Events
# =============================================================================

module "s3_raw_events" {
  source = "./modules/s3"

  project         = var.project
  environment     = var.environment
  name            = "raw-events"
  expiration_days = var.s3_raw_events_expiration_days
}

# =============================================================================
# Timescale Cloud VPC Peering Routes
# =============================================================================

data "aws_vpc_peering_connection" "timescale" {
  filter {
    name   = "accepter-vpc-info.vpc-id"
    values = [module.network.self.vpc_id]
  }

  filter {
    name   = "requester-vpc-info.cidr-block"
    values = [var.timescale_vpc_cidr]
  }

  filter {
    name   = "status-code"
    values = ["active"]
  }
}

resource "aws_route" "timescale_private" {
  count                     = length(module.network.self.private_route_table_ids)
  route_table_id            = module.network.self.private_route_table_ids[count.index]
  destination_cidr_block    = var.timescale_vpc_cidr
  vpc_peering_connection_id = data.aws_vpc_peering_connection.timescale.id
}

# =============================================================================
# RDS - Shared (Keycloak + Temporal)
# =============================================================================

resource "aws_db_parameter_group" "shared" {
  name   = "${var.project}-${var.environment}-shared-pg17"
  family = "postgres17"

  parameter {
    name  = "log_statement"
    value = "ddl"
  }
}

resource "aws_db_instance" "shared" {
  identifier = "${var.project}-${var.environment}-shared"

  engine         = "postgres"
  engine_version = "17.2"
  instance_class = var.shared_database.instance_class

  allocated_storage     = var.shared_database.storage_size
  max_allocated_storage = var.shared_database.max_storage_size
  storage_encrypted     = true

  db_name  = "postgres"
  username = var.shared_database.username
  password = var.shared_database.password

  multi_az               = false
  db_subnet_group_name   = module.network.self.database_subnet_group_name
  vpc_security_group_ids = [module.security_groups.db.security_group_id]
  parameter_group_name   = aws_db_parameter_group.shared.name
  publicly_accessible    = false

  skip_final_snapshot = true
  deletion_protection = var.environment == "prod"

  tags = {
    Name = "${var.project}-${var.environment}-shared"
  }
}

# =============================================================================
# ElastiCache Redis
# =============================================================================

resource "aws_elasticache_parameter_group" "app" {
  name   = "${var.project}-${var.environment}-redis"
  family = var.app_redis.family

  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_subnet_group" "app" {
  name       = "${var.project}-${var.environment}-redis"
  subnet_ids = module.network.self.elasticache_subnets
}

resource "aws_elasticache_replication_group" "app" {
  replication_group_id = "${var.project}-${var.environment}-redis"
  description          = "${var.project} ${var.environment} Redis"

  node_type            = var.app_redis.node_type
  num_cache_clusters   = var.app_redis.node_count
  engine_version       = var.app_redis.engine_version
  parameter_group_name = aws_elasticache_parameter_group.app.name
  subnet_group_name    = aws_elasticache_subnet_group.app.name
  security_group_ids   = [module.security_groups.ecs.security_group_id]

  at_rest_encryption_enabled = var.app_redis.at_rest_encryption
  transit_encryption_enabled = false
  automatic_failover_enabled = var.app_redis.node_count > 1

  port = 6379

  tags = {
    Name = "${var.project}-${var.environment}-redis"
  }
}

# =============================================================================
# Generated Secrets
# =============================================================================

resource "random_password" "secret_key_base" {
  length  = 128
  special = false
}

resource "random_password" "raw_event_encryption_key" {
  length  = 64
  special = false
}

resource "random_password" "keycloak_admin_password" {
  length  = 24
  special = true
}

resource "random_password" "ar_encryption_primary_key" {
  length  = 32
  special = false
}

resource "random_password" "ar_encryption_deterministic_key" {
  length  = 32
  special = false
}

resource "random_password" "ar_encryption_key_derivation_salt" {
  length  = 32
  special = false
}

# =============================================================================
# SSM Parameters
# =============================================================================

resource "aws_ssm_parameter" "database_url" {
  name  = "/${local.ssm_prefix}/DATABASE_URL"
  type  = "SecureString"
  value = "postgres://${var.app_database.username}:${urlencode(var.app_database.password)}@${var.app_database.host}:${var.app_database.port}/tsdb?sslmode=require"
}

resource "aws_ssm_parameter" "redis_url" {
  name  = "/${local.ssm_prefix}/REDIS_URL"
  type  = "SecureString"
  value = "redis://${aws_elasticache_replication_group.app.primary_endpoint_address}:6379/0"
}

resource "aws_ssm_parameter" "secret_key_base" {
  name  = "/${local.ssm_prefix}/SECRET_KEY_BASE"
  type  = "SecureString"
  value = random_password.secret_key_base.result
}

resource "aws_ssm_parameter" "raw_event_encryption_key" {
  name  = "/${local.ssm_prefix}/RAW_EVENT_ENCRYPTION_KEY"
  type  = "SecureString"
  value = random_password.raw_event_encryption_key.result
}

resource "aws_ssm_parameter" "keycloak_admin_password" {
  name  = "/${local.ssm_prefix}/KEYCLOAK_ADMIN_PASSWORD"
  type  = "SecureString"
  value = random_password.keycloak_admin_password.result
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/${local.ssm_prefix}/DATABASE_PASSWORD"
  type  = "SecureString"
  value = var.app_database.password
}

resource "aws_ssm_parameter" "shared_db_password" {
  name  = "/${local.ssm_prefix}/SHARED_DB_PASSWORD"
  type  = "SecureString"
  value = var.shared_database.password
}

resource "aws_ssm_parameter" "google_client_id" {
  name  = "/${local.ssm_prefix}/GOOGLE_CLIENT_ID"
  type  = "SecureString"
  value = var.google_client_id
}

resource "aws_ssm_parameter" "google_client_secret" {
  name  = "/${local.ssm_prefix}/GOOGLE_CLIENT_SECRET"
  type  = "SecureString"
  value = var.google_client_secret
}

resource "aws_ssm_parameter" "github_client_id" {
  name  = "/${local.ssm_prefix}/GITHUB_CLIENT_ID"
  type  = "SecureString"
  value = var.github_client_id
}

resource "aws_ssm_parameter" "github_client_secret" {
  name  = "/${local.ssm_prefix}/GITHUB_CLIENT_SECRET"
  type  = "SecureString"
  value = var.github_client_secret
}

resource "aws_ssm_parameter" "gitlab_client_id" {
  name  = "/${local.ssm_prefix}/GITLAB_CLIENT_ID"
  type  = "SecureString"
  value = var.gitlab_client_id
}

resource "aws_ssm_parameter" "gitlab_client_secret" {
  name  = "/${local.ssm_prefix}/GITLAB_CLIENT_SECRET"
  type  = "SecureString"
  value = var.gitlab_client_secret
}

resource "aws_ssm_parameter" "bitbucket_client_id" {
  name  = "/${local.ssm_prefix}/BITBUCKET_CLIENT_ID"
  type  = "SecureString"
  value = var.bitbucket_client_id
}

resource "aws_ssm_parameter" "bitbucket_client_secret" {
  name  = "/${local.ssm_prefix}/BITBUCKET_CLIENT_SECRET"
  type  = "SecureString"
  value = var.bitbucket_client_secret
}

resource "aws_ssm_parameter" "atlassian_client_id" {
  name  = "/${local.ssm_prefix}/ATLASSIAN_CLIENT_ID"
  type  = "SecureString"
  value = var.atlassian_client_id
}

resource "aws_ssm_parameter" "atlassian_client_secret" {
  name  = "/${local.ssm_prefix}/ATLASSIAN_CLIENT_SECRET"
  type  = "SecureString"
  value = var.atlassian_client_secret
}

resource "aws_ssm_parameter" "linear_client_id" {
  name  = "/${local.ssm_prefix}/LINEAR_CLIENT_ID"
  type  = "SecureString"
  value = var.linear_client_id
}

resource "aws_ssm_parameter" "linear_client_secret" {
  name  = "/${local.ssm_prefix}/LINEAR_CLIENT_SECRET"
  type  = "SecureString"
  value = var.linear_client_secret
}

resource "aws_ssm_parameter" "ar_encryption_primary_key" {
  name  = "/${local.ssm_prefix}/ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY"
  type  = "SecureString"
  value = random_password.ar_encryption_primary_key.result
}

resource "aws_ssm_parameter" "ar_encryption_deterministic_key" {
  name  = "/${local.ssm_prefix}/ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY"
  type  = "SecureString"
  value = random_password.ar_encryption_deterministic_key.result
}

resource "aws_ssm_parameter" "ar_encryption_key_derivation_salt" {
  name  = "/${local.ssm_prefix}/ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT"
  type  = "SecureString"
  value = random_password.ar_encryption_key_derivation_salt.result
}

resource "aws_ssm_parameter" "rollbar_access_token" {
  name  = "/${local.ssm_prefix}/ROLLBAR_ACCESS_TOKEN"
  type  = "SecureString"
  value = var.rollbar_access_token
}

resource "aws_ssm_parameter" "rollbar_client_token" {
  name  = "/${local.ssm_prefix}/ROLLBAR_CLIENT_TOKEN"
  type  = "SecureString"
  value = var.rollbar_client_token
}

# =============================================================================
# Locals for ECS environment variables & secrets
# =============================================================================

locals {
  redis_url        = "redis://${aws_elasticache_replication_group.app.primary_endpoint_address}:6379/0"
  database_host    = var.app_database.host
  database_port    = var.app_database.port
  temporal_host    = "temporal.${local.namespace_name}:7233"
  keycloak_internal = "http://keycloak.${local.namespace_name}:8080"
  keycloak_public   = "https://${var.kc_domain}"

  common_env = {
    RAILS_ENV           = var.environment
    RAILS_LOG_TO_STDOUT = "true"
    DATABASE_HOST       = local.database_host
    DATABASE_PORT       = local.database_port
    DATABASE_NAME       = "tsdb"
    DATABASE_USERNAME   = var.app_database.username
    DATABASE_SSLMODE    = "require"
    REDIS_URL        = local.redis_url
    TEMPORAL_HOST    = local.temporal_host
    KEYCLOAK_ISSUER  = "${local.keycloak_public}/realms/db90"
    KEYCLOAK_JWKS_URI = "${local.keycloak_internal}/realms/db90/protocol/openid-connect/certs"
    S3_BUCKET        = module.s3_raw_events.bucket_name
    S3_REGION        = var.region
    MINIO_ENDPOINT   = "https://s3.${var.region}.amazonaws.com"
    FRONTEND_URL     = "https://${var.app_domain}"
  }

  common_secrets = [
    { name = "SECRET_KEY_BASE", valueFrom = aws_ssm_parameter.secret_key_base.arn },
    { name = "DATABASE_PASSWORD", valueFrom = aws_ssm_parameter.db_password.arn },
    { name = "RAW_EVENT_ENCRYPTION_KEY", valueFrom = aws_ssm_parameter.raw_event_encryption_key.arn },
    { name = "ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY", valueFrom = aws_ssm_parameter.ar_encryption_primary_key.arn },
    { name = "ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY", valueFrom = aws_ssm_parameter.ar_encryption_deterministic_key.arn },
    { name = "ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT", valueFrom = aws_ssm_parameter.ar_encryption_key_derivation_salt.arn },
    { name = "ROLLBAR_ACCESS_TOKEN", valueFrom = aws_ssm_parameter.rollbar_access_token.arn },
    { name = "GITHUB_CLIENT_ID",        valueFrom = aws_ssm_parameter.github_client_id.arn },
    { name = "GITHUB_CLIENT_SECRET",    valueFrom = aws_ssm_parameter.github_client_secret.arn },
    { name = "GITLAB_CLIENT_ID",        valueFrom = aws_ssm_parameter.gitlab_client_id.arn },
    { name = "GITLAB_CLIENT_SECRET",    valueFrom = aws_ssm_parameter.gitlab_client_secret.arn },
    { name = "BITBUCKET_CLIENT_ID",     valueFrom = aws_ssm_parameter.bitbucket_client_id.arn },
    { name = "BITBUCKET_CLIENT_SECRET", valueFrom = aws_ssm_parameter.bitbucket_client_secret.arn },
    { name = "ATLASSIAN_CLIENT_ID",     valueFrom = aws_ssm_parameter.atlassian_client_id.arn },
    { name = "ATLASSIAN_CLIENT_SECRET", valueFrom = aws_ssm_parameter.atlassian_client_secret.arn },
    { name = "LINEAR_CLIENT_ID",        valueFrom = aws_ssm_parameter.linear_client_id.arn },
    { name = "LINEAR_CLIENT_SECRET",    valueFrom = aws_ssm_parameter.linear_client_secret.arn },
  ]
}

# =============================================================================
# ECS App - API
# =============================================================================

module "app_api" {
  source = "./modules/app"

  region      = var.region
  project     = var.project
  environment = var.environment
  name        = "api"

  repository_name = "${var.project}-${var.application}-api"
  cluster_id      = module.ecs_cluster.id
  cluster_name    = module.ecs_cluster.name

  security_group_ids = [module.security_groups.ecs.security_group_id]
  private_subnet_ids = module.network.self.private_subnets
  ecs_role_arn       = module.roles.ecs.arn

  service_name = "${local.app_service_name}-api"
  family       = "${local.app_service_name}-api"
  ecs_service  = var.ecs_service["api"]

  variables = local.common_env
  secrets   = local.common_secrets

  containers = {
    api = {
      name           = "api"
      container_port = 3000
      log_prefix     = "api"
    }
  }

  service_discovery = [
    {
      registry_arn   = module.service_discovery.service_arns["api"]
      container_name = "api"
    }
  ]

  logs_retention_in_days  = var.logs_retention_in_days
  ecs_service_min_percent = var.ecs_service_min_percent
  ecs_service_max_percent = var.ecs_service_max_percent
  autoscaling             = var.autoscaling

  file_ecs_task_definition_sh = "/infra/modules/scripts/ecs-task-definition.sh"
}

# =============================================================================
# ECS App - Web (Nginx + React SPA)
# =============================================================================

module "app_web" {
  source = "./modules/app"

  region      = var.region
  project     = var.project
  environment = var.environment
  name        = "web"

  repository_name = "${var.project}-${var.application}-web"
  cluster_id      = module.ecs_cluster.id
  cluster_name    = module.ecs_cluster.name

  security_group_ids = [module.security_groups.ecs.security_group_id]
  private_subnet_ids = module.network.self.private_subnets
  ecs_role_arn       = module.roles.ecs.arn

  service_name = "${local.app_service_name}-web"
  family       = "${local.app_service_name}-web"
  ecs_service  = var.ecs_service["web"]

  variables = {
    API_UPSTREAM   = "api.${local.namespace_name}:3000"
    KEYCLOAK_URL   = local.keycloak_public
    KEYCLOAK_REALM = "db90"
  }
  secrets = [
    { name = "ROLLBAR_CLIENT_TOKEN", valueFrom = aws_ssm_parameter.rollbar_client_token.arn },
  ]

  containers = {
    web = {
      name           = "web"
      container_port = 80
      log_prefix     = "web"
    }
  }

  load_balancers = {
    web = {
      target_group_arn = module.alb.target_group_arns["${var.project}-${var.environment}-web"]
      container_name   = "web"
      container_port   = 80
    }
  }

  logs_retention_in_days  = var.logs_retention_in_days
  ecs_service_min_percent = var.ecs_service_min_percent
  ecs_service_max_percent = var.ecs_service_max_percent
  autoscaling             = var.autoscaling

  file_ecs_task_definition_sh = "/infra/modules/scripts/ecs-task-definition.sh"
}

# =============================================================================
# ECS App - Sidekiq
# =============================================================================

module "app_sidekiq" {
  source = "./modules/app"

  region      = var.region
  project     = var.project
  environment = var.environment
  name        = "sidekiq"

  repository_name = "${var.project}-${var.application}-api"
  cluster_id      = module.ecs_cluster.id
  cluster_name    = module.ecs_cluster.name

  security_group_ids = [module.security_groups.ecs.security_group_id]
  private_subnet_ids = module.network.self.private_subnets
  ecs_role_arn       = module.roles.ecs.arn

  service_name = "${local.app_service_name}-sidekiq"
  family       = "${local.app_service_name}-sidekiq"
  ecs_service  = var.ecs_service["sidekiq"]

  variables = local.common_env
  secrets   = local.common_secrets

  containers = {
    sidekiq = {
      name           = "sidekiq"
      container_port = 0
      command        = ["bundle", "exec", "sidekiq", "-C", "config/sidekiq.yml"]
      log_prefix     = "sidekiq"
    }
  }

  logs_retention_in_days  = var.logs_retention_in_days
  ecs_service_min_percent = var.ecs_service_min_percent
  ecs_service_max_percent = var.ecs_service_max_percent
  autoscaling             = var.autoscaling

  file_ecs_task_definition_sh = "/infra/modules/scripts/ecs-task-definition.sh"
}

# =============================================================================
# ECS App - Temporal Server
# =============================================================================

module "app_temporal" {
  source = "./modules/app"

  region      = var.region
  project     = var.project
  environment = var.environment
  name        = "temporal"

  image       = "temporalio/auto-setup:latest"
  cluster_id  = module.ecs_cluster.id
  cluster_name = module.ecs_cluster.name

  security_group_ids = [module.security_groups.ecs.security_group_id]
  private_subnet_ids = module.network.self.private_subnets
  ecs_role_arn       = module.roles.ecs.arn

  service_name = "${local.app_service_name}-temporal"
  family       = "${local.app_service_name}-temporal"
  ecs_service  = var.ecs_service["temporal"]

  variables = {
    DB                                     = "postgres12"
    DBNAME                                 = "temporal"
    DB_PORT                                = 5432
    POSTGRES_SEEDS                         = aws_db_instance.shared.address
    POSTGRES_USER                          = var.shared_database.username
    POSTGRES_TLS_ENABLED                   = "true"
    POSTGRES_TLS_DISABLE_HOST_VERIFICATION = "true"
    SQL_TLS_ENABLED                        = "true"
    SQL_TLS_ENABLE_HOST_VERIFICATION       = "false"
    SQL_TLS_DISABLE_HOST_VERIFICATION      = "true"
    TEMPORAL_ADDRESS                       = "0.0.0.0:7233"
  }
  secrets = [
    { name = "POSTGRES_PWD", valueFrom = aws_ssm_parameter.shared_db_password.arn },
  ]

  containers = {
    temporal = {
      name           = "temporal"
      container_port = 7233
      log_prefix     = "temporal"
    }
  }

  service_discovery = [
    {
      registry_arn   = module.service_discovery.service_arns["temporal"]
      container_name = "temporal"
    }
  ]

  logs_retention_in_days  = var.logs_retention_in_days
  ecs_service_min_percent = var.ecs_service_min_percent
  ecs_service_max_percent = var.ecs_service_max_percent
  autoscaling             = var.autoscaling

  file_ecs_task_definition_sh = "/infra/modules/scripts/ecs-task-definition.sh"
}

# =============================================================================
# ECS App - Temporal Worker
# =============================================================================

module "app_temporal_worker" {
  source = "./modules/app"

  region      = var.region
  project     = var.project
  environment = var.environment
  name        = "temporal-worker"

  repository_name = "${var.project}-${var.application}-temporal-worker"
  cluster_id      = module.ecs_cluster.id
  cluster_name    = module.ecs_cluster.name

  security_group_ids = [module.security_groups.ecs.security_group_id]
  private_subnet_ids = module.network.self.private_subnets
  ecs_role_arn       = module.roles.ecs.arn

  service_name = "${local.app_service_name}-temporal-worker"
  family       = "${local.app_service_name}-temporal-worker"
  ecs_service  = var.ecs_service["temporal_worker"]

  variables = merge(local.common_env, {
    TEMPORAL_HOST = local.temporal_host
  })
  secrets = local.common_secrets

  containers = {
    worker = {
      name           = "temporal-worker"
      container_port = 0
      log_prefix     = "temporal-worker"
    }
  }

  logs_retention_in_days  = var.logs_retention_in_days
  ecs_service_min_percent = var.ecs_service_min_percent
  ecs_service_max_percent = var.ecs_service_max_percent
  autoscaling             = var.autoscaling

  file_ecs_task_definition_sh = "/infra/modules/scripts/ecs-task-definition.sh"
}

# =============================================================================
# ECS App - Temporal UI
# =============================================================================

module "app_temporal_ui" {
  source = "./modules/app"

  region      = var.region
  project     = var.project
  environment = var.environment
  name        = "temporal-ui"

  image        = "temporalio/ui:latest"
  cluster_id   = module.ecs_cluster.id
  cluster_name = module.ecs_cluster.name

  security_group_ids = [module.security_groups.ecs.security_group_id]
  private_subnet_ids = module.network.self.private_subnets
  ecs_role_arn       = module.roles.ecs.arn

  service_name = "${local.app_service_name}-temporal-ui"
  family       = "${local.app_service_name}-temporal-ui"
  ecs_service  = var.ecs_service["temporal_ui"]

  variables = {
    TEMPORAL_UI_PORT = "8080"
    TEMPORAL_ADDRESS = local.temporal_host
  }
  secrets = []

  containers = {
    temporal-ui = {
      name           = "temporal-ui"
      container_port = 8080
      log_prefix     = "temporal-ui"
    }
  }

  load_balancers = {
    temporal-ui = {
      target_group_arn = module.alb.target_group_arns["${var.project}-${var.environment}-temporal-ui"]
      container_name   = "temporal-ui"
      container_port   = 8080
    }
  }

  logs_retention_in_days  = var.logs_retention_in_days
  ecs_service_min_percent = var.ecs_service_min_percent
  ecs_service_max_percent = var.ecs_service_max_percent
  autoscaling             = var.autoscaling

  file_ecs_task_definition_sh = "/infra/modules/scripts/ecs-task-definition.sh"

  depends_on = [module.app_temporal]
}

# =============================================================================
# ECS App - Keycloak
# =============================================================================

module "app_keycloak" {
  source = "./modules/app"

  region      = var.region
  project     = var.project
  environment = var.environment
  name        = "keycloak"

  repository_name = "${var.project}-${var.application}-keycloak"
  cluster_id      = module.ecs_cluster.id
  cluster_name    = module.ecs_cluster.name

  security_group_ids = [module.security_groups.ecs.security_group_id]
  private_subnet_ids = module.network.self.private_subnets
  ecs_role_arn       = module.roles.ecs.arn

  service_name = "${local.app_service_name}-keycloak"
  family       = "${local.app_service_name}-keycloak"
  ecs_service  = var.ecs_service["keycloak"]

  variables = {
    KC_DB              = "postgres"
    KC_DB_URL_HOST     = aws_db_instance.shared.address
    KC_DB_URL_PORT     = "5432"
    KC_DB_URL_DATABASE = "keycloak"
    KC_DB_USERNAME     = var.shared_database.username
    KC_HOSTNAME        = var.kc_domain
    KC_PROXY_HEADERS   = "xforwarded"
    KC_HTTP_ENABLED    = "true"
    KC_HEALTH_ENABLED  = "true"
    KC_SSL_REQUIRED    = "external"
    KEYCLOAK_ADMIN     = "admin"
    APP_URL            = "https://${var.app_domain}"
  }
  secrets = [
    { name = "KEYCLOAK_ADMIN_PASSWORD", valueFrom = aws_ssm_parameter.keycloak_admin_password.arn },
    { name = "KC_DB_PASSWORD", valueFrom = aws_ssm_parameter.shared_db_password.arn },
    { name = "GOOGLE_CLIENT_ID", valueFrom = aws_ssm_parameter.google_client_id.arn },
    { name = "GOOGLE_CLIENT_SECRET", valueFrom = aws_ssm_parameter.google_client_secret.arn },
  ]

  containers = {
    keycloak = {
      name           = "keycloak"
      container_port = 8080
      command        = ["start", "--import-realm"]
      log_prefix     = "keycloak"
    }
  }

  load_balancers = {
    kc = {
      target_group_arn = module.alb.target_group_arns["${var.project}-${var.environment}-kc"]
      container_name   = "keycloak"
      container_port   = 8080
    }
  }

  service_discovery = [
    {
      registry_arn   = module.service_discovery.service_arns["keycloak"]
      container_name = "keycloak"
    }
  ]

  logs_retention_in_days  = var.logs_retention_in_days
  ecs_service_min_percent = var.ecs_service_min_percent
  ecs_service_max_percent = var.ecs_service_max_percent
  autoscaling             = var.autoscaling

  file_ecs_task_definition_sh = "/infra/modules/scripts/ecs-task-definition.sh"
}

# =============================================================================
# CloudWatch Dashboard
# =============================================================================

module "dashboard" {
  source = "./modules/cloudwatch_dashboard"

  project      = var.project
  environment  = var.environment
  region       = var.region
  cluster_name = module.ecs_cluster.name

  services = {
    api             = module.app_api.service_name
    web             = module.app_web.service_name
    sidekiq         = module.app_sidekiq.service_name
    temporal        = module.app_temporal.service_name
    temporal_worker = module.app_temporal_worker.service_name
    temporal_ui     = module.app_temporal_ui.service_name
    keycloak        = module.app_keycloak.service_name
  }

  alb_arn_suffix   = module.alb.alb_arn_suffix
  tg_arn_suffix    = module.alb.tg_arn_suffixes["${var.project}-${var.environment}-web"]
  redis_cluster_id = aws_elasticache_replication_group.app.id
}
