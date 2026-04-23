# ═══════════════════════════════════════════════════════════════════════════════
#  Ghostwire — Terraform Variables
# ═══════════════════════════════════════════════════════════════════════════════

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (staging | production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

variable "project" {
  description = "Project name used as a prefix on all resources"
  type        = string
  default     = "ghostwire"
}

# ── Networking ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones to use (at least 2 for HA)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# ── ECS / Compute ─────────────────────────────────────────────────────────────

variable "backend_cpu" {
  description = "Fargate CPU units for backend task (256, 512, 1024...)"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Fargate memory (MB) for backend task"
  type        = number
  default     = 1024
}

variable "frontend_cpu" {
  description = "Fargate CPU units for frontend task"
  type        = number
  default     = 256
}

variable "frontend_memory" {
  description = "Fargate memory (MB) for frontend task"
  type        = number
  default     = 512
}

variable "backend_desired_count" {
  description = "Desired number of backend task replicas"
  type        = number
  default     = 2
}

variable "frontend_desired_count" {
  description = "Desired number of frontend task replicas"
  type        = number
  default     = 2
}

# ── Container images ──────────────────────────────────────────────────────────

variable "backend_image" {
  description = "Full ECR image URI for the backend (set via CI)"
  type        = string
  default     = ""
}

variable "frontend_image" {
  description = "Full ECR image URI for the frontend (set via CI)"
  type        = string
  default     = ""
}

# ── RDS ───────────────────────────────────────────────────────────────────────

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "rds_allocated_storage" {
  description = "Initial RDS storage in GB"
  type        = number
  default     = 20
}

variable "rds_db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "ghostwire"
}

variable "rds_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "ghostwire"
}

# Stored in AWS Secrets Manager — NOT hardcoded
variable "rds_password" {
  description = "PostgreSQL master password (sensitive)"
  type        = string
  sensitive   = true
}

# ── ElastiCache ───────────────────────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_nodes" {
  description = "Number of Redis cache nodes"
  type        = number
  default     = 1
}

# ── Application ───────────────────────────────────────────────────────────────

variable "domain_name" {
  description = "Custom domain for the application (e.g. ghostwire.yourdomain.com)"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS (required if domain_name is set)"
  type        = string
  default     = ""
}

variable "jwt_secret" {
  description = "JWT signing secret (sensitive)"
  type        = string
  sensitive   = true
}

variable "api_keys" {
  description = "Comma-separated API keys for webhook access"
  type        = string
  sensitive   = true
}

# ── Tags ──────────────────────────────────────────────────────────────────────

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default = {
    Project     = "ghostwire"
    ManagedBy   = "terraform"
  }
}
