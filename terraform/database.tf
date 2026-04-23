# ═══════════════════════════════════════════════════════════════════════════════
#  Ghostwire — RDS PostgreSQL + ElastiCache Redis
# ═══════════════════════════════════════════════════════════════════════════════

# ── RDS Subnet Group ──────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-rds-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${local.name_prefix}-rds-subnet-group" }
}

# ── RDS Parameter Group ───────────────────────────────────────────────────────

resource "aws_db_parameter_group" "postgres" {
  name   = "${local.name_prefix}-postgres16"
  family = "postgres16"

  parameter {
    name  = "log_connections"
    value = "1"
  }
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # log queries > 1s
  }
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
}

# ── RDS PostgreSQL Instance ───────────────────────────────────────────────────

resource "aws_db_instance" "postgres" {
  identifier = "${local.name_prefix}-postgres"

  engine               = "postgres"
  engine_version       = "16.3"
  instance_class       = var.rds_instance_class
  allocated_storage    = var.rds_allocated_storage
  max_allocated_storage = var.rds_allocated_storage * 5  # auto-scaling up to 5x
  storage_type         = "gp3"
  storage_encrypted    = true

  db_name  = var.rds_db_name
  username = var.rds_username
  password = var.rds_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name

  multi_az               = var.environment == "production"
  publicly_accessible    = false
  deletion_protection    = var.environment == "production"
  skip_final_snapshot    = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${local.name_prefix}-final-snapshot" : null

  backup_retention_period = var.environment == "production" ? 7 : 1
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  tags = { Name = "${local.name_prefix}-postgres" }
}

# ── ElastiCache Subnet Group ──────────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-redis-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${local.name_prefix}-redis-subnet-group" }
}

# ── ElastiCache Redis Parameter Group ────────────────────────────────────────

resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7"
  name   = "${local.name_prefix}-redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"  # expired key events — useful for session TTL notifications
  }
}

# ── ElastiCache Redis Cluster ─────────────────────────────────────────────────

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "Ghostwire Redis cache and session store"

  node_type            = var.redis_node_type
  num_cache_clusters   = var.redis_num_nodes
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.rds_password  # reuse secret or use separate var

  automatic_failover_enabled = var.redis_num_nodes > 1
  multi_az_enabled           = var.redis_num_nodes > 1

  snapshot_retention_limit = 1
  snapshot_window          = "02:00-03:00"
  maintenance_window       = "sun:05:00-sun:06:00"

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.backend.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }

  tags = { Name = "${local.name_prefix}-redis" }
}
