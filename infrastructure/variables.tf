variable "region" {
  type = string
}

variable "project" {
  type = string
}

variable "application" {
  type    = string
  default = "app"
}

variable "environment" {
  type = string

  validation {
    condition     = var.environment != "default"
    error_message = "Use 'terraform workspace select ENV' where ENV: staging/production."
  }
}

# --- Domain ---

variable "domain" {
  type = string
}

variable "zone_id" {
  type = string
}

variable "app_domain" {
  type = string
}

variable "kc_domain" {
  type = string
}

variable "temporal_ui_domain" {
  type = string
}

# --- Networking ---

variable "network" {
  type = object({
    cidr                = string
    private_subnets     = list(string)
    public_subnets      = list(string)
    database_subnets    = list(string)
    elasticache_subnets = list(string)
    single_nat_gateway  = bool
  })
}

# --- Databases (Timescale Cloud) ---

variable "app_database" {
  type = object({
    host     = string
    port     = number
    username = string
    password = string
    name     = string
  })
  sensitive = true
}

variable "timescale_vpc_cidr" {
  type    = string
  default = "172.30.0.0/16"
}

# Timescale Cloud VPC peering: routes from private subnets to Timescale.
# Set manage_timescale_vpc_routes = false on first apply if peering is not active yet (avoids data source error).
# Optionally set timescale_vpc_peering_connection_id = "pcx-..." after creating peering in AWS/Timescale.
variable "manage_timescale_vpc_routes" {
  type        = bool
  default     = true
  description = "Create aws_route entries via VPC peering to Timescale. Disable until peering exists."
}

variable "timescale_vpc_peering_connection_id" {
  type        = string
  default     = ""
  description = "If non-empty, use this peering connection ID; otherwise resolve via data source when manage_timescale_vpc_routes is true."
}

variable "google_client_id" {
  type      = string
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "github_client_id" {
  type      = string
  sensitive = true
}

variable "github_client_secret" {
  type      = string
  sensitive = true
}

variable "gitlab_client_id" {
  type      = string
  sensitive = true
}

variable "gitlab_client_secret" {
  type      = string
  sensitive = true
}

variable "bitbucket_client_id" {
  type      = string
  sensitive = true
}

variable "bitbucket_client_secret" {
  type      = string
  sensitive = true
}

variable "atlassian_client_id" {
  type      = string
  sensitive = true
}

variable "atlassian_client_secret" {
  type      = string
  sensitive = true
}

variable "linear_client_id" {
  type      = string
  sensitive = true
}

variable "linear_client_secret" {
  type      = string
  sensitive = true
}

variable "shared_database" {
  type = object({
    username         = string
    password         = string
    instance_class   = string
    storage_size     = number
    max_storage_size = number
  })
  sensitive = true
}

# --- Redis ---

variable "app_redis" {
  type = object({
    node_count         = number
    engine_version     = string
    family             = string
    node_type          = string
    at_rest_encryption = bool
  })
}

# --- S3 ---

variable "s3_raw_events_expiration_days" {
  type    = number
  default = 3
}

# --- ECS ---

variable "ecs_service" {
  type = map(object({
    cpu                  = number
    memory               = number
    desired_count        = number
    enable_fargate_spot  = bool
    fargate_base         = number
    autoscaling_min_size = number
    autoscaling_max_size = number
    first_add            = bool
  }))
}

variable "autoscaling" {
  type = object({
    cpu_average_target    = number
    memory_average_target = number
    scale_in_cooldown     = number
    scale_out_cooldown    = number
  })
}

variable "ecs_service_min_percent" {
  type = number
}

variable "ecs_service_max_percent" {
  type = number
}

variable "logs_retention_in_days" {
  type = number
}

variable "ssm_key_prefix" {
  type = string
}

# --- Rollbar ---

variable "rollbar_access_token" {
  type      = string
  sensitive = true
}

variable "rollbar_client_token" {
  type      = string
  sensitive = true
}

variable "alb_oidc_client_id" {
  type        = string
  description = "Keycloak OIDC client ID for ALB authentication (protects Temporal UI)"
  default     = ""
}

variable "alb_oidc_client_secret" {
  type        = string
  sensitive   = true
  description = "Keycloak OIDC client secret for ALB authentication"
  default     = ""
}

