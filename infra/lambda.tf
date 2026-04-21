data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_src"
  output_path = "${path.module}/lambda_src.zip"
}

data "aws_caller_identity" "current" {}

resource "aws_iam_role" "lambda" {
  name = "${local.name_prefix}-lambda-role"
  tags = local.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_lightsail" {
  name = "${local.name_prefix}-lightsail-power"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lightsail:StopInstance",
          "lightsail:StartInstance",
          "lightsail:GetInstance",
        ]
        Resource = "arn:aws:lightsail:${var.region}:${data.aws_caller_identity.current.account_id}:Instance/*"
      },
    ]
  })
}

resource "aws_lambda_function" "ec2_scheduler" {
  function_name    = local.name_prefix
  role             = aws_iam_role.lambda.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      INSTANCE_NAME     = var.instance_name
      RETREAT_CHECK_URL = var.retreat_check_url
    }
  }

  tags = local.tags
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.ec2_scheduler.function_name}"
  retention_in_days = 14
  tags              = local.tags
}
