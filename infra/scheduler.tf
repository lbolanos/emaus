resource "aws_iam_role" "scheduler" {
  name = "${local.name_prefix}-scheduler-role"
  tags = local.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name = "${local.name_prefix}-invoke-lambda"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = aws_lambda_function.ec2_scheduler.arn
    }]
  })
}

resource "aws_scheduler_schedule" "stop" {
  name = "${local.name_prefix}-stop"

  # Lightsail charges a flat monthly fee regardless of whether the instance
  # is running or stopped. Auto-stop saves nothing in dollars on Lightsail.
  # Schedule kept DISABLED as a reusable artifact in case we ever move back
  # to EC2 (where hourly compute pausing does save money) or want to stop
  # the instance nightly for security (uptime reduction).
  state = "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.stop_cron
  schedule_expression_timezone = var.timezone

  target {
    arn      = aws_lambda_function.ec2_scheduler.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ action = "stop" })
  }
}

resource "aws_scheduler_schedule" "start" {
  name  = "${local.name_prefix}-start"
  state = "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.start_cron
  schedule_expression_timezone = var.timezone

  target {
    arn      = aws_lambda_function.ec2_scheduler.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ action = "start" })
  }
}
