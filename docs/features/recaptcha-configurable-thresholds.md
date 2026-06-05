# reCAPTCHA v3 — configurable score thresholds

Server-side reCAPTCHA v3 validation protects public forms and auth endpoints
from bots. v3 returns a **score** from `0.0` (bot) to `1.0` (human); the server
rejects a request whose score is below a configurable threshold.

Service: `apps/api/src/services/recaptchaService.ts`.

## Skip rules (why it never fails locally)

`verifyToken` returns `{ valid: true }` **without calling Google** when:

1. `NODE_ENV === 'development'`, or
2. `RECAPTCHA_SECRET_KEY` is unset or the placeholder `YOUR_RECAPTCHA_V3_SECRET_KEY_HERE`.

So in local dev the score check never runs. The threshold only matters in
production (real secret key + real token).

## Thresholds (env-configurable, no redeploy)

Thresholds are resolved at request time via `resolveMinScore(envVarName, fallback)`,
so they can be tuned by editing the prod `.env` + restarting the API — no rebuild.
Invalid values (non-numeric, outside `[0, 1]`) are ignored with a warning and the
fallback is used.

| Env var                     | Default | Applies to                                                              |
| --------------------------- | ------- | ----------------------------------------------------------------------- |
| `RECAPTCHA_MIN_SCORE`       | `0.5`   | Service default for any endpoint that doesn't pass its own `minScore`.  |
| `RECAPTCHA_MIN_SCORE_LOGIN` | `0.3`   | Login only (`POST /api/auth/login`).                                    |

### Why login is more lenient

v3 scores legitimate users low for many benign reasons (VPN, fresh browser
profile, incognito, privacy extensions, low page interaction). On login the real
brute-force defenses are **rate limiting + account lockout** (passport still
validates credentials after the captcha gate), so a hard `0.5` cutoff mostly
blocks real people. Login defaults to `0.3` and is independently tunable.

Public forms (registration, newsletter, community join, santísimo, …) keep the
explicit `0.5` at their call sites — they are more bot-targeted and were not the
problem. They are unaffected by `RECAPTCHA_MIN_SCORE_LOGIN`.

## Diagnostics

When login is blocked, the server logs (no PII, no secrets):

```
Login bloqueado por reCAPTCHA (score 0.30): reCAPTCHA score too low (0.30 < 0.3)
```

Visible in `pm2` logs. Use it to tell config problems (all scores clustered low,
e.g. `~0.1–0.3`) from real behavior (scores vary).

## A low score is usually misconfiguration, not the threshold

A **consistent ~0.30** for real users is abnormal and points at config, not at a
threshold that's too high. Lowering the threshold is a stopgap — check the
[reCAPTCHA admin console](https://www.google.com/recaptcha/admin) for the site:

1. Domain `emaus.cc` (and `www.emaus.cc`) is in the allowed domains list.
2. The site is **v3** (not v2).
3. The frontend `VITE_RECAPTCHA_SITE_KEY` and the backend `RECAPTCHA_SECRET_KEY`
   belong to the **same** reCAPTCHA site.

## Frontend

- Service: `apps/web/src/services/recaptcha.ts` (loads `api.js?render=<siteKey>`,
  calls `grecaptcha.execute(siteKey, { action })`).
- Site key: `VITE_RECAPTCHA_SITE_KEY` (public, baked into the build).
- Always use the centralized API service — the token rides in the request body
  (`recaptchaToken`).

## Tests

- `apps/api/src/tests/services/recaptchaService.test.ts` — `resolveMinScore`
  parsing/validation, env-driven default, explicit override beats env.
- `apps/api/src/tests/controllers/authController.test.ts` (`describe('login')`) —
  login uses the `0.3` login threshold, and a failed captcha returns `400`
  **before** credentials are checked (+ diagnostic log).
