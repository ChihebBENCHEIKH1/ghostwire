# ═══════════════════════════════════════════════════════════════════════════════
#  Ghostwire — Terraform Outputs
# ═══════════════════════════════════════════════════════════════════════════════

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Route53 zone ID for the ALB (for ALIAS records)"
  value       = aws_lb.main.zone_id
}

output "ecr_backend_url" {
  description = "ECR repository URL for the backend image"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_url" {
  description = "ECR repository URL for the frontend image"
  value       = aws_ecr_repository.frontend.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name (used by CD pipeline)"
  value       = aws_ecs_cluster.main.name
}

output "ecs_backend_service" {
  description = "ECS backend service name (used by CD pipeline)"
  value       = aws_ecs_service.backend.name
}

output "ecs_frontend_service" {
  description = "ECS frontend service name (used by CD pipeline)"
  value       = aws_ecs_service.frontend.name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port)"
  value       = "${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}"
  sensitive   = true
}

output "redis_primary_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "secrets_arn" {
  description = "Secrets Manager ARN for app secrets"
  value       = aws_secretsmanager_secret.app_secrets.arn
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}
