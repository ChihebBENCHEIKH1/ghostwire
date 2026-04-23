# ═══════════════════════════════════════════════════════════════════════════════
#  Ghostwire — Terraform Root Module
#  Target: AWS ECS Fargate + RDS PostgreSQL + ElastiCache Redis + ALB
# ═══════════════════════════════════════════════════════════════════════════════

terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state — use S3 + DynamoDB for locking
  # Uncomment and set bucket/table after running `terraform init` the first time:
  #
  # backend "s3" {
  #   bucket         = "ghostwire-terraform-state"
  #   key            = "production/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "ghostwire-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.tags, {
      Environment = var.environment
    })
  }
}

# ── Locals ────────────────────────────────────────────────────────────────────

locals {
  name_prefix = "${var.project}-${var.environment}"

  backend_image  = var.backend_image  != "" ? var.backend_image  : "${aws_ecr_repository.backend.repository_url}:latest"
  frontend_image = var.frontend_image != "" ? var.frontend_image : "${aws_ecr_repository.frontend.repository_url}:latest"
}

# ── ECR Repositories ──────────────────────────────────────────────────────────

resource "aws_ecr_repository" "backend" {
  name                 = "${local.name_prefix}-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true  # automatic vulnerability scanning on every push
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "${local.name_prefix}-frontend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Lifecycle policy — keep only last 10 images in ECR to control storage costs
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  repository = aws_ecr_repository.frontend.name
  policy     = aws_ecr_lifecycle_policy.backend.policy
}

# ── Secrets Manager ───────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "${local.name_prefix}/app-secrets"
  recovery_window_in_days = 7
  description             = "Ghostwire application runtime secrets"
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    JWT_SECRET    = var.jwt_secret
    API_KEYS      = var.api_keys
    DB_PASSWORD   = var.rds_password
  })
}

# ── CloudWatch Log Groups ─────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name_prefix}/backend"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${local.name_prefix}/frontend"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "nginx" {
  name              = "/ecs/${local.name_prefix}/nginx"
  retention_in_days = 14
}
