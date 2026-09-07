---
name: retreat-keepsakes
description: "Armar el recuerdo de un retiro ya terminado: la pieza vertical con la foto de grupo y el rótulo del retiro, para enviar por WhatsApp o publicar. Usar cuando se pida «el recuerdo del retiro», «un cartel con la foto del grupo», «poner el nombre y las fechas sobre la foto», «algo para mandar del retiro que acabó», o al reencuadrar/regenerar uno ya hecho. Cubre el generador HTML+Chrome, la paleta de la comunidad, cómo pasar una foto horizontal a vertical sin recortar a nadie del grupo, cómo decidir el encuadre cuando la pieza sale descuadrada, por qué hay que pedir el original de la cámara en vez del reenvío de WhatsApp, y cómo entregarla sin que WhatsApp deshaga la definición."
---

# El recuerdo del retiro

Pieza vertical: foto de grupo enmarcada, rótulo del retiro y fechas, sobre un fondo hecho con la
propia foto difuminada. Sale en 9:16 para estados e historias y en 4:5 para feed.

## Recuerdo ≠ convocatoria

El recuerdo va **después** del retiro y no lleva nada de captación: sin QR de registro, sin
costo, sin «cupo limitado», sin métodos de pago. Un cartel de convocatoria sí los lleva
(`/Users/lbolanos/Developer/personal/emaus/local-assets/m5-cartel.png` es el ejemplo), pero ese
material tiene sus propias reglas de contenido público — ver `docs/features/landing-page.md` y la
sección de superficies públicas del `AGENTS.md`. La de aquí: **no publicar montos**, porque cada
retiro tiene el suyo.

## La fuente manda: pedir el original

Una foto reenviada por WhatsApp llega a **1600×1200 y calidad JPEG 50**, sin EXIF. El original
del teléfono es 4000×3000 a calidad 92 — 6,25× más píxeles. En el reenvío cada rostro mide 25-30
px y ningún reenfoque lo recupera: `-despeckle` + Lanczos + unsharp sobre un q50 solo produce
caras de plástico.

```bash
magick identify -format "%wx%h q=%Q %[exif:Model]\n" foto.jpg
```

`q=50` sin modelo de cámara es un reenvío. Los originales suelen estar en `~/Downloads` con
nombres correlativos (`347740.jpg`, `347750.jpg`…).

**Los nombres no dicen qué toma es cuál.** De una misma sesión hay ráfagas: el grupo quieto, el
grupo con los brazos en alto, los servidores serios, los servidores celebrando. Para emparejar
una toma con la que ya se aprobó, comparar la **disposición de las personas**, no el nombre ni la
hora:

```bash
magick compare -metric RMSE \
  \( original.jpg -resize 256x256! -colorspace Gray \) \
  \( montada.jpg  -resize 256x256! -colorspace Gray \) null:
# ~0.0004 = misma toma;  >0.05 = otra ráfaga
```

Si la montada es un **recorte**, aplicar el mismo `-crop` al original antes de comparar, o el
RMSE sale alto y parece otra toma cuando no lo es.

## Generar

```bash
/Users/lbolanos/Developer/personal/emaus/.ruler/skills/retreat-keepsakes/scripts/render-keepsake.sh \
  --photo ~/Downloads/347750.jpg \
  --kicker "Retiro de Emaús Hombres" \
  --headline "Veracruz XXIII" \
  --dates "del 4 al 6 de septiembre 2026" \
  --slug servidores \
  --out ~/Documents/Emaus/Veracruz/recuerdo
```

Saca `<slug>-story.png` (2160×3840), `<slug>-feed.png` (2160×2700) y el JPEG de cada uno.
`--scale` gobierna la resolución: con 2, el texto se **rasteriza** al doble, no se amplía un
bitmap. `--formats story` limita a uno. `--emblem none` quita la cruz con rosa.

El texto va en dos niveles a propósito: el `--kicker` pequeño en dorado y el `--headline` grande
en blanco. Una sola línea corrida con todo el nombre del retiro se vuelve ilegible en un móvil.

## Cuando la pieza sale descuadrada

Casi siempre es la foto, no la plantilla: sobra cielo arriba y césped abajo, y el grupo queda
pequeño o desplazado.

```bash
.../scripts/measure-photo.sh ~/Downloads/347750.jpg 20
```

Informa el tamaño y la calidad, perfila la imagen por franjas, detecta el cielo plano de arriba
y deja una versión con rejilla cada 10 % en `/tmp/chrome` para decidir mirando.

Dos cosas que el número **no** dice, y cuestan un recorte mal hecho:

- **El pico de desviación estándar no es la gente.** El follaje y la fachada tienen tanto detalle
  o más. En el retiro de Veracruz XXIII el pico caía en el edificio, con el grupo 1200 px más
  abajo. La rejilla lo resuelve en un vistazo.
- **La gente llega casi a los bordes laterales.** En la foto del grupo completo iba de x≈430 a
  x≈3860 de 4000: 140 px de margen. Estrechar el ancho corta a alguien, así que para quitar
  césped se **abre la proporción** (3:2, 16:9) y se toca solo la altura. Recortar manteniendo 4:3
  es justo lo que no se puede hacer.

Cuando hay que elegir encuadre, generar varias proporciones de la misma foto y compararlas
montadas, no en crudo: la proporción cambia el equilibrio de toda la pieza. En 20:9 el grupo se
ve grande pero el cartel se llena de fondo vacío.

## Entregar

El PNG es el maestro; el JPEG q92 (~1,5-2 MB) es para compartir. **Se manda como documento, no
como foto**: enviado como foto, WhatsApp lo recomprime a q50 y deshace exactamente la definición
que se acaba de ganar — es lo que le pasó a las fotos de origen.

## Bajo el capó

- Fondo: la misma foto a `blur(52px)` con un lavado azul encima. Es lo que permite montar una
  foto horizontal en vertical sin recortar a nadie.
- Paleta de la comunidad, tomada del cartel del repo: azul `#1F3055`, dorado `#D4A512`, dorado
  claro `#F0D48A`, fondo `#16233F`.
- Emblema: `apps/web/public/crossRoseButtT.png` de la app; el script resuelve la raíz del repo
  con `git rev-parse`, así que funciona igual en un worktree.
- Tipografía: Avenir Next Condensed para el rótulo, Avenir Next para las fechas. Instaladas en
  macOS; también hay Futura, Gill Sans y Didot si hace falta otro carácter.

**Chrome headless no termina tras `--screenshot`** y bloquearía el render siguiente del lote; ni
`--virtual-time-budget` ni un `--user-data-dir` por render lo evitan. El script espera a que el
tamaño del PNG se estabilice y lo mata. Detalle y el porqué: skill `pdf-membretado`, sección Ruta
Chrome. De ahí también sale que un data URI de varios MB no cabe como argumento de proceso
(`ARG_MAX`): el script pasa rutas a Python y el base64 se calcula dentro.

## Archivos

| | |
|---|---|
| `assets/keepsake.html` | Plantilla; los `__PLACEHOLDER__` los sustituye el script |
| `scripts/render-keepsake.sh` | Generador. `--help` lista las opciones |
| `scripts/measure-photo.sh` | Perfil y rejilla para decidir el encuadre |

Relacionados: `printable-documents` (PDFs dentro de la app), `youtube-publishing` (miniaturas y
arte del canal), `demo-videos` (video de una feature).
