// Cloudflare Worker: proxies every request to the origin; if the origin
// returns a 5xx or fails (timeout, connection error), returns a static
// Spanish maintenance page with a 503 status.
//
// Route: emaus.cc/*, www.emaus.cc/*  (configured in infra/cloudflare.tf)
// Free tier: 100,000 requests/day — well above expected traffic.

export default {
	async fetch(request, env, ctx) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10_000);

		try {
			const response = await fetch(request, { signal: controller.signal });
			clearTimeout(timeoutId);

			if (response.status >= 500 && response.status <= 599) {
				return maintenancePage();
			}
			return response;
		} catch (err) {
			clearTimeout(timeoutId);
			return maintenancePage();
		}
	},
};

function maintenancePage() {
	return new Response(MAINTENANCE_HTML, {
		status: 503,
		headers: {
			'content-type': 'text/html;charset=UTF-8',
			'cache-control': 'no-store',
			'retry-after': '300',
		},
	});
}

const MAINTENANCE_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Emaús — en mantenimiento</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: #f9f5ef;
    color: #3c2e1c;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    padding: 24px;
    text-align: center;
    line-height: 1.6;
  }
  .card {
    max-width: 520px;
    background: #fff;
    border-radius: 16px;
    padding: 48px 32px;
    box-shadow: 0 8px 32px rgba(60, 46, 28, 0.12);
  }
  .icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
  h1 {
    font-size: 28px;
    margin: 0 0 16px;
    font-weight: 600;
  }
  p { margin: 8px 0; }
  .small {
    color: #8a7b68;
    font-size: 14px;
    margin-top: 32px;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1410; color: #e8dcc8; }
    .card { background: #2a1f15; box-shadow: 0 8px 32px rgba(0,0,0,.4); }
    .small { color: #a89a85; }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">🕊️</div>
    <h1>Volvemos pronto</h1>
    <p>Estamos realizando mantenimiento en el sistema.</p>
    <p>Por favor intenta de nuevo en unos minutos.</p>
    <p class="small">Si el problema persiste, contacta al administrador del retiro.</p>
  </div>
</body>
</html>`;
