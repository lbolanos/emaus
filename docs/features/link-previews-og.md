# Previews de enlace por retiro (Open Graph)

Cuando alguien comparte por WhatsApp `https://emaus.cc/celayav` (o `/celayav/server`),
el rastreador que genera la tarjeta **no ejecuta JavaScript**. Del SPA solo lee las metas
genéricas de `apps/web/index.html`, así que todos los retiros mostraban la misma tarjeta.

Como esos enlaces de inscripción son el canal real de difusión, se sirve a los rastreadores
—y solo a ellos— un HTML mínimo con las metas del retiro concreto.

## Cómo funciona

```
WhatsApp/Facebook/Telegram  →  nginx (detecta el user agent)  →  GET /api/og/<slug>[/server]
Persona                     →  nginx  →  index.html (SPA, sin cambios)
```

- **nginx** (`nginx.conf`, `location ~ ^/([a-z0-9]+)(/server)?$`): si el `User-Agent` es de
  un rastreador conocido, hace `proxy_pass` a `/api/og/<slug>`; si no, `try_files` como siempre.
  El patrón es `set` + `if` + `proxy_pass`, y los capturados `$1`/`$2` se guardan en variables
  antes del `if` porque no sobreviven a ese bloque.
- **API** (`apps/api/src/controllers/ogController.ts`, ruta en `ogRoutes.ts` bajo `/api/og`):
  busca el retiro con `findBySlug` y responde `text/html` con `Cache-Control: public, max-age=300`.

Qué sale en la tarjeta:

| Caso | Título | Descripción |
| --- | --- | --- |
| Retiro público futuro | `Retiro Emaús Celaya · 28 al 30 de agosto de 2026` | `Inscríbete en línea. Hacienda Landeta, San Miguel de Allende.` |
| `/…/server` | `Servidores · Retiro Emaús Celaya · …` | `Inscripción del equipo de servidores. …` |
| Retiro ya terminado | igual | `Este retiro ya se realizó en … Consulta los próximos retiros en emaus.cc.` |
| Slug inexistente o retiro no público | `Retiros Emaús` (genérico) | descripción genérica del sitio |

El último caso es deliberado: responder 200 con la tarjeta genérica evita confirmar si existe
un retiro privado detrás de esa URL. Todo valor que viene de la base se escapa antes de
inyectarse en el HTML.

Las fechas son columnas *date-only* guardadas como medianoche UTC, así que se formatean con
`timeZone: 'UTC'` (ver skill `timezone-handling`, regla N°3): formatearlas en la zona del
servidor las correría un día hacia atrás.

## Requisitos al desplegar

1. **`FRONTEND_URL` debe apuntar al dominio público** en `.env.production`
   (`https://emaus.cc`). De ahí salen `og:url` y `og:image`; si quedara en `localhost:5173`,
   las tarjetas saldrían con URLs inservibles. Es la misma variable que usa el CORS.
2. **Recargar nginx** tras copiar la config: `sudo nginx -t && sudo systemctl reload nginx`.
3. **Forzar el re-scrape**: WhatsApp y Facebook cachean el preview con fuerza. Usar el
   depurador de Facebook (`https://developers.facebook.com/tools/debug/`) con la URL del
   retiro y pulsar «Scrape Again». WhatsApp reutiliza ese caché.

## Cómo probar

```bash
# Local (API en 3084): la respuesta debe traer las metas del retiro
curl -s -A "WhatsApp/2.23.20.0" http://localhost:3084/api/og/celayav | grep "og:"

# Producción, simulando al rastreador sobre la URL real
curl -s -A "facebookexternalhit/1.1" https://emaus.cc/celayav | grep "og:title"

# Y que una persona siga recibiendo el SPA
curl -s https://emaus.cc/celayav | grep "<div id=\"app\">"
```

Tests: `apps/api/src/tests/controllers/ogController.test.ts` (contrato HTML, escapado,
retiro pasado, slug desconocido, y el formateo de fechas sin corrimiento de día).

## Pendiente (fase 2)

La imagen de la tarjeta es la genérica `/og-image.jpg` para todos los retiros. Generar una por
retiro (con parroquia y fechas quemadas) exige producir un PNG en el servidor: `sharp` en el API,
o generarla al publicar el retiro y subirla al bucket `emaus-media`. El título y la descripción
ya dan la mayor parte del valor, así que quedó fuera de la primera fase.
