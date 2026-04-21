# Cloudflare failover Worker
#
# Runs on every request to emaus.cc and www.emaus.cc. Passes traffic through
# to the origin; if the origin returns a 5xx or fails, serves a Spanish
# maintenance page (503) instead of Cloudflare's default error screen.
#
# Source: infra/workers/failover.js

resource "cloudflare_workers_script" "failover" {
  account_id = var.cloudflare_account_id
  name       = "emaus-failover"
  content    = file("${path.module}/workers/failover.js")
  module     = true
}

resource "cloudflare_workers_route" "apex" {
  zone_id     = var.cloudflare_zone_id
  pattern     = "${var.domain}/*"
  script_name = cloudflare_workers_script.failover.name
}

resource "cloudflare_workers_route" "www" {
  zone_id     = var.cloudflare_zone_id
  pattern     = "www.${var.domain}/*"
  script_name = cloudflare_workers_script.failover.name
}
