# Lightsail application server
#
# Replaces the old EC2 t3a.micro (i-011986d465e7c8f53). Bundled pricing
# ($7/mo for micro_3_0) covers compute + IPv4 + 2 TB transfer.
#
# The instance is provisioned empty; bootstrap (node, pnpm, nginx, certbot,
# pm2) is done via `deploy/lightsail/setup-lightsail.sh` run manually after
# provisioning. Keeping user_data out of Terraform avoids re-baking the
# instance on every script tweak.

resource "aws_lightsail_instance" "emaus" {
  name              = var.instance_name
  availability_zone = var.lightsail_availability_zone
  blueprint_id      = var.lightsail_blueprint_id
  bundle_id         = var.lightsail_bundle_id
  tags              = local.lightsail_tags
}

resource "aws_lightsail_static_ip" "emaus" {
  name = "${local.lightsail_name_prefix}-ip"
}

resource "aws_lightsail_static_ip_attachment" "emaus" {
  static_ip_name = aws_lightsail_static_ip.emaus.name
  instance_name  = aws_lightsail_instance.emaus.name
}

resource "aws_lightsail_instance_public_ports" "emaus" {
  instance_name = aws_lightsail_instance.emaus.name

  port_info {
    from_port         = 22
    to_port           = 22
    protocol          = "tcp"
    cidrs             = ["0.0.0.0/0"]
    ipv6_cidrs        = ["::/0"]
    cidr_list_aliases = []
  }

  port_info {
    from_port         = 80
    to_port           = 80
    protocol          = "tcp"
    cidrs             = ["0.0.0.0/0"]
    ipv6_cidrs        = ["::/0"]
    cidr_list_aliases = []
  }

  port_info {
    from_port         = 443
    to_port           = 443
    protocol          = "tcp"
    cidrs             = ["0.0.0.0/0"]
    ipv6_cidrs        = ["::/0"]
    cidr_list_aliases = []
  }

  # The provider computes a hash of port_info that is extremely sensitive to
  # ordering and implicit defaults returned by the AWS API; any subsequent
  # plan otherwise reads as "destroy + create", and the destroy takes 20+
  # minutes on Lightsail. Ports are managed here on first apply; later
  # changes must be made via `aws lightsail {open,close}-instance-public-ports`.
  lifecycle {
    ignore_changes = [port_info]
  }
}

# App IAM user: grants the running process access to S3 (avatars, media)
# without baking long-lived account-admin keys. SES continues to use the
# pre-existing SMTP credentials (not managed here).

resource "aws_iam_user" "app" {
  name = "${local.lightsail_name_prefix}-lightsail-app"
  tags = local.lightsail_tags
}

resource "aws_iam_user_policy" "app" {
  name = "${local.lightsail_name_prefix}-s3-access"
  user = aws_iam_user.app.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.s3_media_bucket}"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "arn:aws:s3:::${var.s3_media_bucket}/*"
      },
    ]
  })
}

resource "aws_iam_access_key" "app" {
  user = aws_iam_user.app.name
}
