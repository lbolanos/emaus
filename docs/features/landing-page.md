# Landing pública (`/`)

**La audiencia es el caminante**: alguien que llega desde un enlace de WhatsApp y no sabe qué es
un retiro de Emaús. Todo lo que sea operación del sistema (asignar camas, armar mesas, gestionar
comunidades) es material del equipo servidor y vive en la **ayuda in-app**, detrás del login.
Esa distinción es la regla que ordena esta página.

Vista: `apps/web/src/views/LandingView.vue`. Componentes propios en
`apps/web/src/components/landing/`.

## Estructura

| Orden | Sección (`id`) | Monta | Contenido |
| --- | --- | --- | --- |
| 1 | hero | `LandingView.vue` | Título, subtítulo, CTA a `#retreats` y botón secundario a `#the-path` |
| 2 | `#the-path` | `LandingThePath.vue` | Qué es el retiro: tres pasos + 6 preguntas frecuentes |
| 3 | `#retreats` | `LandingView.vue` | Próximos retiros (`GET /api/retreats/public`) + modal de volante |
| 4 | `#community` | `CommunityMap.vue`, `CommunityDetailModal.vue` | Mapa y buscador de comunidades |
| 5 | (sin id) | `LandingView.vue` | Próximas reuniones de comunidad |
| 6 | `#stories` | `LandingView.vue` | Testimonios publicados (`GET /api/landing/testimonials`) |
| 7 | `#inscripcion` | `LandingVideos.vue` | Video de cómo inscribirse + CTA a `#retreats` |
| 8 | (sin id) | `LandingView.vue` | Suscripción al boletín + footer |

El nav (desktop y móvil) lista las secciones **en el mismo orden**: El Camino · Retiros ·
Comunidad · Historias · Inscripción. Cada ítem debe apuntar a una sección que exista — hubo un
ítem apuntando a `#the-path` cuando esa sección no existía y el click no hacía nada. Hay un test
que recorre las anclas del nav y falla si alguna no tiene sección (`LandingView.test.ts`).

## Reglas de contenido

Todo el texto vive en `apps/web/src/locales/{es,en}.json` bajo `landing.*`; no hay copy
hardcodeado en los componentes. Decisiones de la organización, protegidas por
`apps/web/src/locales/__tests__/landingPublicContent.test.ts`:

- **No se mencionan las palancas ni las cartas.** Son la sorpresa del retiro para el caminante.
- **No se ofrecen becas.** Existen solo para casos excepcionales; anunciarlas crea una
  expectativa equivocada.
- **No se publica un monto.** Cada retiro tiene su propio costo y lo publica junto con las
  fechas; la respuesta del FAQ solo dice qué cubre: hospedaje, comidas y materiales.
- **No se enlaza el canal de YouTube.** Ver abajo.

Las cuatro reglas salieron de correcciones hechas sobre texto ya publicado, así que el test las
convierte en error de suite en vez de en confianza.

## Videos

`LandingVideos.vue` renderiza `LANDING_VIDEOS` de `apps/web/src/config/landingVideos.ts`. Hoy es
un solo video —«Cómo inscribirte a un retiro», `jQb3q-mUG-8`, el único del canal dirigido a
caminantes— y se muestra grande; con dos o más entradas el componente pasa a grid solo.

El reproductor abre en un modal propio (no reka-ui): monta el `<iframe>` de
`youtube-nocookie.com` únicamente al abrir, cierra con Escape o clic fuera, bloquea el scroll del
body y devuelve el foco al cerrar.

**Para agregar un video** (además de sumarlo a `LANDING_VIDEOS` y a `landing.videos.items` en los
dos locales):

```bash
# 1. miniatura local — la landing no hotlinkea i.ytimg.com
curl -s -o /tmp/t.jpg https://i.ytimg.com/vi/<id>/maxresdefault.jpg
magick /tmp/t.jpg -resize 1280x720 -quality 82 -strip apps/web/public/videos/<id>.webp

# 2. duración real para el badge
curl -s "https://www.youtube.com/watch?v=<id>" | grep -o '"lengthSeconds":"[0-9]*"' | head -1
```

`apps/web/src/config/__tests__/landingVideos.test.ts` falla si falta la miniatura, si falta el
título en algún idioma, si la duración no es plausible o si se cuela un video que no está en la
lista de material para caminantes.

El canal completo y la playlist son públicos y se comparten con los servidores por fuera de la
app; la landing no los enlaza y el footer no lleva ícono de YouTube. Detalle:
`docs/features/video-tutorials-checklist.md`.

## Estado vacío de Historias

Con `testimonials.length === 0` (hoy, en producción) la sección se renderiza compacta: ~396 px en
vez de ~900 px de hueco antes del CTA final, conservando el encabezado y el botón para compartir
una historia, que es lo que alimenta la sección. Se controla con el computed `hasNoStories`.

## Imágenes y peso

Todas las imágenes se sirven desde `apps/web/public/` — no se hotlinkea Unsplash ni ytimg:

| Archivo | Uso | Peso |
| --- | --- | --- |
| `landing.webp` + `landing-736.webp` | hero, con `srcset` y `fetchpriority="high"` | 116 KB / 31 KB |
| `crossRoseButtT.png` | logo (nav 32 px, footer 24 px); lo usan también Sidebar, Login, Terms y Privacy | 22 KB |
| `cta-bg.webp` | fondo del bloque de boletín, `loading="lazy"` | 137 KB |
| `retreats/retreat-{1,2,3}.webp` | pool de las tarjetas de retiro | 38-89 KB |
| `videos/<id>.webp` | miniaturas del reproductor | ~34 KB |
| `og-image.jpg` | tarjeta al compartir (1200×630) | 122 KB |

Referencia medida en el navegador: **165 KB** de imágenes en la carga inicial, incluidos los
tiles de OpenStreetMap del mapa. Antes de optimizar eran ~2.8 MB solo entre hero y logo (el logo
era un PNG de 636×636 y 964 KB para pintarse a 32 px).

## SEO y previews

`apps/web/index.html` lleva title descriptivo, `description`, Open Graph completo con
`og:image` absoluta y Twitter card — sin eso, compartir el sitio por WhatsApp no genera preview.
Protegido por `apps/web/src/test/indexHtmlSeo.test.ts`, que además verifica que sigan los
polyfills de Safari iOS antiguo.

Los enlaces de inscripción de cada retiro (`/<slug>`, `/<slug>/server`) tienen preview propio con
parroquia y fechas, resuelto en nginx + API: `docs/features/link-previews-og.md`.

## Endpoints públicos que consume

`GET /api/retreats/public` · `GET /api/communities/public` ·
`GET /api/communities/public/meetings` · `GET /api/landing/testimonials` ·
`POST /api/newsletter/subscribe`.

> ⚠️ `GET /api/retreats/public` devuelve la entidad completa, incluidos `paymentInfo` (banco,
> cuenta y CLABE) y `contactPhones`. El volante público los muestra a propósito, pero el listado
> los entrega en JSON a cualquiera sin abrir nada. Pendiente evaluado, no implementado: que el
> listado devuelva solo lo que las tarjetas usan y esos campos lleguen al consultar un retiro
> concreto.
