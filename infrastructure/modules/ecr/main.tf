locals {
  environments_by_count = [for value in var.environments_by_count : {
    rulePriority = value.priority
    description  = "${value.name}: keep last ${value.count} images"
    action = {
      type = "expire"
    }
    selection = {
      tagStatus     = "tagged"
      tagPrefixList = [value.name]
      countType     = "imageCountMoreThan"
      countNumber   = value.count
    }
  }]

  environments_other = [{
    rulePriority = 1000
    description  = "Keep last ${var.other_count} other images"
    action = {
      type = "expire"
    }
    selection = {
      tagStatus   = "any"
      countType   = "imageCountMoreThan"
      countNumber = var.other_count
    }
  }]
}

resource "aws_ecr_repository" "repo" {
  name = var.name
}

resource "aws_ecr_lifecycle_policy" "policy" {
  repository = aws_ecr_repository.repo.name

  policy = jsonencode({
    rules = concat(local.environments_by_count, local.environments_other)
  })
}
