module "variables" {
  source = "../variables"
  map    = var.variables
}

module "logs" {
  source = "../cloudwatch"

  project     = var.project
  environment = var.environment
  name        = var.name

  logs_retention_in_days = var.logs_retention_in_days
}

data "aws_ecr_repository" "repo" {
  count = var.image != "" ? 0 : 1
  name  = var.repository_name
}

data "external" "task_definition" {
  program = ["bash", var.file_ecs_task_definition_sh]
  query = {
    service     = module.service.name
    cluster     = var.cluster_name
    path_root   = jsonencode(path.root)
    environment = var.environment
  }
}

module "task_definition" {
  source = "../ecs_task_definition"

  project     = var.project
  environment = var.environment
  name        = var.name
  first_add   = var.ecs_service.first_add

  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]

  cpu    = var.ecs_service.cpu
  memory = var.ecs_service.memory

  execution_role_arn = var.ecs_role_arn
  task_role_arn      = var.ecs_role_arn

  container_definitions = [
    for container in var.containers : merge(
      {
        name      = container.name
        image     = var.image != "" ? var.image : "${data.aws_ecr_repository.repo[0].repository_url}:${data.external.task_definition.result.image_tag}"
        essential = true
        cpu       = 0

        environment = module.variables.map
        secrets     = var.secrets

        portMappings = length(try(container.portMappings, [])) > 0 ? container.portMappings : (container.container_port == 0 ? [] : [
          {
            containerPort = container.container_port
            hostPort      = container.container_port
            protocol      = "tcp"
          }
        ])

        volumesFrom    = []
        mountPoints    = try(container.mount_points, [])
        systemControls = []

        logConfiguration = {
          logDriver = "awslogs"
          options = {
            awslogs-group         = module.logs.name
            awslogs-region        = var.region
            awslogs-stream-prefix = container.log_prefix
          }
        }

        linuxParameters = {
          initProcessEnabled = true
        }
      },
      try(length(container.command), 0) > 0 ? { command = container.command } : {},
      try(container.workingDirectory, null) != null ? { workingDirectory = container.workingDirectory } : {}
    )
  ]

  family = var.family
}

module "service" {
  source = "../ecs_service"

  project     = var.project
  environment = var.environment
  name        = var.name

  cluster_id          = var.cluster_id
  task_definition_arn = module.task_definition.self.arn
  desired_count       = var.ecs_service.desired_count
  min_percent         = var.ecs_service_min_percent
  max_percent         = var.ecs_service_max_percent
  security_groups     = var.security_group_ids
  subnets             = var.private_subnet_ids

  enable_fargate_spot = var.ecs_service.enable_fargate_spot
  fargate_base        = var.ecs_service.fargate_base

  service_name      = var.service_name
  load_balancers    = var.load_balancers
  service_discovery = var.service_discovery
}

module "autoscaling" {
  source       = "../ecs_autoscaling"
  cluster_name = var.cluster_name
  service_name = module.service.name

  cpu_average_target    = var.autoscaling.cpu_average_target
  memory_average_target = var.autoscaling.memory_average_target
  scale_in_cooldown     = var.autoscaling.scale_in_cooldown
  scale_out_cooldown    = var.autoscaling.scale_out_cooldown

  min_capacity = var.ecs_service.autoscaling_min_size
  max_capacity = var.ecs_service.autoscaling_max_size

  depends_on = [module.service]
}
