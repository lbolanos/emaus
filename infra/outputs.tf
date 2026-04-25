output "lambda_function_name" {
  value       = aws_lambda_function.ec2_scheduler.function_name
  description = "Name of the Lambda that stops/starts the Lightsail instance"
}

output "lambda_function_arn" {
  value = aws_lambda_function.ec2_scheduler.arn
}

output "stop_schedule_arn" {
  value = aws_scheduler_schedule.stop.arn
}

output "start_schedule_arn" {
  value = aws_scheduler_schedule.start.arn
}

output "log_group" {
  value = aws_cloudwatch_log_group.lambda.name
}

# Lightsail

output "lightsail_instance_name" {
  value       = aws_lightsail_instance.emaus.name
  description = "Lightsail instance name (matches INSTANCE_NAME in Lambda)"
}

output "lightsail_public_ip" {
  value       = aws_lightsail_static_ip.emaus.ip_address
  description = "Static IPv4 to point the Cloudflare A record at"
}

output "lightsail_ssh_user_host" {
  value       = "ubuntu@${aws_lightsail_static_ip.emaus.ip_address}"
  description = "Default SSH target — use the key from aws lightsail download-default-key-pair"
}

output "app_iam_access_key_id" {
  value       = aws_iam_access_key.app.id
  description = "Access key for the app IAM user (S3 access)"
  sensitive   = true
}

output "app_iam_secret_access_key" {
  value       = aws_iam_access_key.app.secret
  description = "Secret access key for the app IAM user — write to .env.production as AWS_SECRET_ACCESS_KEY"
  sensitive   = true
}

# Cloudflare

output "failover_worker_name" {
  value       = cloudflare_workers_script.failover.name
  description = "Cloudflare Worker that serves the maintenance page when origin is down"
}
