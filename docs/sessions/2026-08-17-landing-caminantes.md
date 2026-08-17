# Sesión 2026-08-17 — Landing para caminantes, videos y previews de enlace

Empezó como «poner el canal de YouTube en la landing» y acabó reordenando la página alrededor de
su audiencia real. Resumen de lo hecho, con apuntadores, y las lecciones que conviene no volver a
aprender.

## Qué se hizo

| Commit | Cambio |
| --- | --- |
| `fcae4b5` | Imágenes locales en webp + Open Graph en `index.html`. De ~2.8 MB a 165 KB de imágenes en la carga inicial |
| `0e06eca` | Sección de videos del canal al cierre de la página |
| `5244310` | Sección «El Camino»: tres pasos del retiro + 6 preguntas frecuentes |
| `ae45619` | Historias compacta mientras no haya testimonios publicados |
| `cc2dfad` | Buzón del proyecto en los contactos del footer |
| `137453e` | Corrección de la respuesta de costos del FAQ |
| `d1deb22` | Preview propio al compartir el enlace de un retiro (nginx + `/api/og/:slug`) |
| `245fe5c` | Fuera las palancas y las cartas del texto público |
| `5031f29` | Separar material de caminantes del de servidores: la landing se queda con el video de inscripción |
| `aef5572` | Los tutoriales vuelven a públicos: la separación es de exposición, no de visibilidad |

Documentación: `docs/features/landing-page.md`, `docs/features/link-previews-og.md`, y la sección
de audiencia en `docs/features/video-tutorials-checklist.md`.

## Lecciones aprendidas

### 1. La audiencia manda sobre el pedido literal

El pedido era «colocar el canal de YouTube en el landing». Ejecutarlo al pie de la letra puso seis
tutoriales de operación del sistema en la puerta de entrada del caminante, más un botón al canal
donde el 95 % del material es para el equipo servidor. La pregunta que faltaba desde el minuto uno
era **quién lee esta página**. Cuando el dueño la formuló («el landing es para caminantes, todo lo
demás es solo para servidores»), la sección pasó de seis videos a uno y el enlace al canal
desapareció.

Aplicable a cualquier superficie pública del proyecto: antes de agregar contenido, decidir a quién
va dirigido y qué material corresponde a esa audiencia.

### 2. Las decisiones de contenido se pierden si no son un test

En una sola sesión hubo que corregir cuatro afirmaciones ya publicadas: las becas (existen solo
para casos excepcionales), el costo (varía por retiro e incluye materiales), y dos menciones a las
palancas y las cartas (son la sorpresa del retiro). Nada de eso es deducible del código, así que
volvería a colarse en la siguiente reescritura de copy.

Ahora está en `apps/web/src/locales/__tests__/landingPublicContent.test.ts`: si alguien vuelve a
escribir «palanca», «beca» o un monto en `landing.*`, la suite falla y dice por qué.

### 3. Un SPA no puede dar previews por ruta sin ayuda del servidor

Los rastreadores de WhatsApp, Facebook y Telegram no ejecutan JavaScript: leen el HTML que
devuelve nginx y se van. Da igual lo que pinte Vue. Antes de esta sesión, compartir
`emaus.cc/celayav` mostraba `<title>Emaus</title>` y ninguna meta.

La solución barata no fue SSR ni prerender, sino **desviar solo a los rastreadores** a un endpoint
que devuelve un HTML con las metas del retiro (`nginx.conf` + `apps/api/src/controllers/ogController.ts`).
Las personas siguen recibiendo el SPA intacto. Detalle y pasos de despliegue en
`docs/features/link-previews-og.md`.

### 4. Poner videos en `unlisted` no basta si la playlist es pública

Al separar audiencias se pasaron 18 videos a `unlisted`. La playlist «Emaús Retiros — Tutoriales»
seguía pública, y **una playlist pública muestra los videos `unlisted` que contiene a cualquiera
con su enlace**: la separación era ilusoria hasta que la playlist también pasó a `unlisted`.

(Ese cambio se revirtió después por decisión del dueño —los tutoriales son públicos y el enlace se
comparte con los servidores—, pero el mecanismo sigue siendo cierto para la próxima vez.)

Al cambiar visibilidad por API, `videos.update part=status` **reemplaza** el recurso: hay que
reenviar `embeddable`, `license`, `publicStatsViewable` y `selfDeclaredMadeForKids` junto con
`privacyStatus`, o se pierden.

### 5. happy-dom miente sobre `body.style` una vez que lo reseteas

Un test del bloqueo de scroll del modal pasaba aislado y fallaba en el archivo completo. No era
Vue: una vez que **cualquier** test del archivo ejecuta `document.body.style.overflow = ''`, el
getter `style.overflow` devuelve `''` para siempre en ese archivo, aunque el atributo sí se
actualice. Se reproduce sin Vue en dos `it()`.

Fix: leer `document.body.getAttribute('style')`. Documentado como caso #17 del skill
`troubleshooting`, con la reproducción mínima.

### 6. Los datos que el FAQ inventa suelen estar en la base

Se redactaron a mano respuestas sobre costo y qué llevar, y luego apareció que `GET /api/retreats/public`
ya devuelve `cost`, `thingsToBringNotes`, `walkerArrivalTime` y `openingNotes` por retiro. El camino
correcto es leer el dato, no describirlo en prosa: queda como mejora pendiente para el FAQ.

De paso, ese endpoint expone `paymentInfo` (banco, cuenta, CLABE) y `contactPhones` de personas
concretas, sin autenticación. El volante público los usa a propósito, pero el listado los entrega
en JSON a cualquiera. Recomendación pendiente: adelgazar el listado y servir esos campos solo al
consultar un retiro concreto.

### 7. Un commit por tema se puede reconstruir después

Los cinco primeros commits salieron de un árbol donde `LandingView.vue`, los dos locales y su test
tenían cambios de cinco temas mezclados. Se reconstruyeron aplicando los cambios por etapas con un
script de reemplazos con aserciones, y verificando al final que los archivos quedaran **idénticos
byte a byte** al estado que ya estaba probado. Esa verificación final es la que hace segura la
maniobra; sin ella es fácil perder un cambio en el camino.

### 8. Trabajar en el mismo worktree que otra sesión es riesgoso

A mitad del trabajo aparecieron en el árbol 27 archivos de otra feature (preparaciones) escritos
por otra sesión. Ninguno entró en los commits porque siempre se hizo `git add` con rutas
explícitas, pero **lint-staged hace stash y restore de lo no preparado en cada commit**: con dos
sesiones escribiendo a la vez, ahí es donde se pierden cambios. Conviene una sesión por worktree
(ver skill `worktree-testing`).

### 9. Escapar «los campos de texto» no es escapar la salida

En `renderPreview` del preview OG se escapaban `title` y `description` —lo que *parecía* el texto—
pero no la URL, que se arma con el slug del retiro y entra en cuatro atributos del HTML. Un slug
con comillas rompía el atributo y permitía inyectar marcado, incluido un `<meta refresh>` a otro
dominio **servido desde emaus.cc**. Lo encontró y corrigió otra sesión (`06dda32`, `a717678`), con
escape en el punto de salida más un `^[a-z0-9-]+$` en el schema del slug.

Dos cosas que llevarse:

- El criterio no es «qué campo parece texto», sino **qué posición de la plantilla recibe datos**.
  Todo lo interpolado cuenta: atributos, URLs, `content=` de las metas.
- El test que ya existía probaba el escapado **desde la parroquia** y daba sensación de cobertura.
  Cubría una vía de entrada, no el punto de salida — que es lo que hay que probar.

Detalle en el skill `security-best-practices`.

## Pendientes que quedaron anotados

1. Desplegar el preview por retiro: `nginx.conf` al servidor + reload + confirmar `FRONTEND_URL`,
   y forzar el re-scrape en el depurador de Facebook.
2. Adelgazar `GET /api/retreats/public` (CLABE y teléfonos fuera del listado).
3. FAQ que lea el costo, la lista de qué llevar y la hora de llegada del próximo retiro.
4. Correo del proyecto también en `PrivacyPolicyView` y `TermsView`.
5. Fase 2 del preview: imagen propia por retiro (requiere generar PNG en el servidor).
