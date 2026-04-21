terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.40"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

locals {
  name_prefix = "emaus-ec2-scheduler"
  tags = {
    Project   = "emaus"
    ManagedBy = "terraform"
    Purpose   = "ec2-auto-stop"
  }

  lightsail_name_prefix = "emaus"
  lightsail_tags = {
    Project   = "emaus"
    ManagedBy = "terraform"
    Purpose   = "app-server"
  }
}
