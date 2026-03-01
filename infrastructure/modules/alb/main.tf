resource "aws_lb" "main" {
  name               = var.alb_name
  internal           = var.internal
  load_balancer_type = "application"
  security_groups    = var.security_groups
  subnets            = var.subnets
  idle_timeout       = 300

  enable_deletion_protection = false

  tags = {
    Name = var.alb_name
  }
}

resource "aws_alb_target_group" "main" {
  for_each             = var.target_groups
  name                 = each.key
  port                 = 80
  protocol             = "HTTP"
  vpc_id               = var.vpc_id
  target_type          = "ip"
  deregistration_delay = var.deregistration_delay

  dynamic "health_check" {
    for_each = var.health_check_path == "" && each.value.health_check_path == null ? toset([]) : toset([1])
    content {
      healthy_threshold   = coalesce(each.value.health_check_healthy_threshold, var.health_check_healthy_threshold)
      interval            = coalesce(each.value.health_check_interval, var.health_check_interval)
      protocol            = "HTTP"
      matcher             = "200"
      timeout             = var.health_check_timeout
      path                = each.value.health_check_path != null ? each.value.health_check_path : var.health_check_path
      unhealthy_threshold = coalesce(each.value.health_check_unhealthy_threshold, var.health_check_unhealthy_threshold)
    }
  }

  stickiness {
    cookie_duration = 86400
    enabled         = false
    type            = "lb_cookie"
  }

  tags = {
    Name = each.key
  }
}

resource "aws_alb_listener" "http_only" {
  load_balancer_arn = aws_lb.main.id
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = 443
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_alb_listener" "https" {
  for_each          = { for idx, tg in keys(var.target_groups) : idx => tg if idx == 0 }
  load_balancer_arn = aws_lb.main.id
  port              = 443
  protocol          = "HTTPS"

  ssl_policy      = "ELBSecurityPolicy-2016-08"
  certificate_arn = var.certificate_arn

  default_action {
    order            = 1
    target_group_arn = aws_alb_target_group.main[keys(var.target_groups)[0]].arn
    type             = "forward"

    forward {
      target_group {
        arn    = aws_alb_target_group.main[keys(var.target_groups)[0]].arn
        weight = 1
      }
    }
  }
}

resource "aws_lb_listener_rule" "main" {
  for_each = { for rule in var.listener_rules : "${rule.service}-${rule.priority}" => rule }

  listener_arn = aws_alb_listener.https[0].arn
  priority     = each.value.priority

  dynamic "action" {
    for_each = each.value.auth ? [1] : []
    content {
      type = "authenticate-oidc"
      authenticate_oidc {
        issuer                 = var.oidc_issuer
        authorization_endpoint = var.oidc_authorization_endpoint
        token_endpoint         = var.oidc_token_endpoint
        user_info_endpoint     = var.oidc_user_info_endpoint
        client_id              = var.oidc_client_id
        client_secret          = var.oidc_client_secret
      }
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.main[each.value.service].arn
  }

  condition {
    host_header {
      values = each.value.hosts
    }
  }
}
