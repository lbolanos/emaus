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

# Bot Fight Mode — free-plan toggle that blocks known bad bots at the edge.
# `enable_js` is required by the API whenever `fight_mode = true` (CF injects a
# JS challenge on HTML responses to fingerprint automated clients).
resource "cloudflare_bot_management" "emaus" {
  zone_id            = var.cloudflare_zone_id
  fight_mode         = true
  enable_js          = true
  ai_bots_protection = "block"
}

# Rate limiting on /api/auth/* to deter credential-stuffing and password-reset
# abuse at the edge. The Express app has its own limiter (loginLimiter,
# passwordResetLimiter) — this just absorbs the traffic before it hits
# Lightsail.
#
# Free-plan constraints: `period` and `mitigation_timeout` are forced to 10s.
# Effect: 10 req/10s per IP → block for 10s on breach. A real user fumbling a
# password doesn't come close; a bot spraying credentials gets throttled.
resource "cloudflare_ruleset" "rate_limit_auth" {
  zone_id     = var.cloudflare_zone_id
  name        = "default"
  description = ""
  kind        = "zone"
  phase       = "http_ratelimit"

  rules {
    description = "10 req/10s per IP on /api/auth/*"
    expression  = "(starts_with(http.request.uri.path, \"/api/auth/\"))"
    action      = "block"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src", "cf.colo.id"]
      period              = 10
      requests_per_period = 10
      mitigation_timeout  = 10
    }
  }
}
