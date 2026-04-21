variable "region" {
  type        = string
  description = "AWS region where the Lightsail instance lives"
  default     = "us-east-2"
}

variable "aws_profile" {
  type        = string
  description = "AWS CLI profile to use (~/.aws/config)"
  default     = "emaus"
}

variable "instance_name" {
  type        = string
  description = "Lightsail instance the Lambda will start/stop"
  default     = "emaus-prod"
}

variable "retreat_check_url" {
  type        = string
  description = "Public endpoint returning { active: boolean, retreats: [...] }"
  default     = "https://emaus.cc/api/retreats/active"
}

variable "timezone" {
  type        = string
  description = "IANA timezone used by the EventBridge schedules"
  default     = "America/Mexico_City"
}

variable "stop_cron" {
  type        = string
  description = "When to stop the instance (EventBridge cron syntax)"
  default     = "cron(0 23 ? * MON-FRI *)"
}

variable "start_cron" {
  type        = string
  description = "When to start the instance (EventBridge cron syntax)"
  default     = "cron(0 7 ? * MON-FRI *)"
}

# Lightsail server

variable "lightsail_availability_zone" {
  type        = string
  description = "AZ where the Lightsail instance will be provisioned"
  default     = "us-east-2a"
}

variable "lightsail_bundle_id" {
  type        = string
  description = "Lightsail bundle (see: aws lightsail get-bundles)"
  default     = "micro_3_0"
}

variable "lightsail_blueprint_id" {
  type        = string
  description = "Lightsail blueprint (OS image)"
  default     = "ubuntu_22_04"
}

variable "s3_media_bucket" {
  type        = string
  description = "S3 bucket for avatar and media storage"
  default     = "emaus-media"
}

# Cloudflare

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account id (dashboard: Account Home → right sidebar)"
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone id for emaus.cc"
  default     = "76f81f5e48b75a90923775f24880309f"
}

variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API token with Workers Scripts:Edit, Workers Routes:Edit, Zone:DNS:Read"
  sensitive   = true
}

variable "domain" {
  type        = string
  description = "Primary domain served by the app"
  default     = "emaus.cc"
}
