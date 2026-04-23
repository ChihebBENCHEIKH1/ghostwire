# ═══════════════════════════════════════════════════════════════════════════════
#  Ghostwire — ECS Fargate Cluster + Task Definitions + Services
# ═══════════════════════════════════════════════════════════════════════════════

# ── ECS Cluster ───────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# ── IAM Roles ─────────────────────────────────────────────────────────────────

# Task execution role — ECS pulls images + writes logs
resource "aws_iam_role" "ecs_execution" {
  name = "${local.name_prefix}-ecs-execution-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow ECS to read secrets from Secrets Manager
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "read-app-secrets"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.app_secrets.arn]
    }]
  })
}

# Task role — runtime permissions (CloudWatch metrics, S3 if needed)
resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-ecs-task-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_cloudwatch" {
  name = "push-cloudwatch-metrics"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["cloudwatch:PutMetricData", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "*"
    }]
  })
}

# ── EFS for SQLite persistence (optional — use RDS in production) ─────────────

resource "aws_efs_file_system" "pipeline_data" {
  creation_token   = "${local.name_prefix}-pipeline-data"
  encrypted        = true
  performance_mode = "generalPurpose"
  throughput_mode  = "bursting"

  tags = { Name = "${local.name_prefix}-efs-pipeline" }
}

resource "aws_efs_mount_target" "pipeline_data" {
  count           = length(var.availability_zones)
  file_system_id  = aws_efs_file_system.pipeline_data.id
  subnet_id       = aws_subnet.private[count.index].id
  security_groups = [aws_security_group.backend.id]
}

# ── Backend Task Definition ───────────────────────────────────────────────────

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  volume {
    name = "pipeline-data"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.pipeline_data.id
      root_directory     = "/"
      transit_encryption = "ENABLED"
    }
  }

  container_definitions = jsonencode([{
    name      = "backend"
    image     = local.backend_image
    essential = true

    portMappings = [{
      containerPort = 3001
      protocol      = "tcp"
    }]

    mountPoints = [{
      sourceVolume  = "pipeline-data"
      containerPath = "/data"
      readOnly      = false
    }]

    environment = [
      { name = "NODE_ENV",         value = "production" },
      { name = "PORT",             value = "3001" },
      { name = "FRONTEND_ORIGIN",  value = "https://${var.domain_name}" },
      { name = "DB_PATH",          value = "/data/pipeline.db" },
    ]

    secrets = [
      { name = "JWT_SECRET",  valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:JWT_SECRET::" },
      { name = "API_KEYS",    valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:API_KEYS::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "backend"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:3001/health | grep -q ok || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])
}

# ── Frontend Task Definition ──────────────────────────────────────────────────

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${local.name_prefix}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.frontend_cpu
  memory                   = var.frontend_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "frontend"
    image     = local.frontend_image
    essential = true

    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV",                   value = "production" },
      { name = "NEXT_PUBLIC_BACKEND_URL",    value = "https://${var.domain_name}" },
    ]

    secrets = [
      { name = "NEXT_PUBLIC_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:API_KEYS::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "frontend"
      }
    }
  }])
}

# ── ECS Services ──────────────────────────────────────────────────────────────

resource "aws_ecs_service" "backend" {
  name            = "${local.name_prefix}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.backend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 3001
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true  # auto-rollback on deployment failure
  }

  deployment_controller {
    type = "ECS"
  }

  lifecycle {
    ignore_changes = [task_definition]  # managed by CI/CD
  }

  depends_on = [aws_lb_listener_rule.backend_api]
}

resource "aws_ecs_service" "frontend" {
  name            = "${local.name_prefix}-frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.frontend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.frontend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener.https]
}

# ── Auto-Scaling ──────────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "backend" {
  max_capacity       = 10
  min_capacity       = var.backend_desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "backend_cpu" {
  name               = "${local.name_prefix}-backend-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
