#!/usr/bin/env bash
# Genera un PDF membretado de Emaús a partir de un HTML de CONTENIDO.
#
#   build-pdf.sh <contenido.html> <salida.pdf> [kicker] [pie-izquierdo]
#
# <contenido.html> lleva SOLO el cuerpo del documento (sin <html>/<head>/<body>):
# el script le pone el esqueleto, las fuentes, membrete.css, el logo embebido
# como data URI, y lo envuelve en la tabla .hoja cuyo <thead>/<tfoot> hacen que
# el membrete y el pie se repitan en todas las páginas (ver membrete.css).
# Si existe <contenido>.css junto al HTML, se inyecta después de membrete.css.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTENIDO="${1:?falta el HTML de contenido}"
SALIDA="${2:?falta la ruta del PDF de salida}"
KICKER="${3:-}"
PIE_IZQ="${4:-Emaús del Valle · Documento interno}"

COMUNIDAD="${EMAUS_COMUNIDAD:-Emaús del Valle}"
PARROQUIA="${EMAUS_PARROQUIA:-Parroquia El Señor del Buen Despacho · Ciudad de México}"
CHROME="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "No encuentro Chrome en: $CHROME (exporta CHROME_BIN)" >&2; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
LOGO_URI="data:image/png;base64,$(base64 < "$SKILL_DIR/assets/logo-emaus.png" | tr -d '\n')"

{
  printf '%s\n' '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
  printf '<title>%s</title>\n' "${KICKER:-Emaús}"
  printf '%s\n' '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap">'
  printf '<style>\n'; cat "$SKILL_DIR/assets/membrete.css"; printf '\n</style>\n'
  # Hoja propia del documento, si existe junto al contenido
  [ -f "${CONTENIDO%.html}.css" ] && { printf '<style>\n'; cat "${CONTENIDO%.html}.css"; printf '\n</style>\n'; }
  printf '%s\n' '</head><body>'
  printf '%s\n' '<table class="hoja"><thead><tr><td>'
  printf '<div class="membrete"><img src="%s" alt=""><div class="ident"><span class="comunidad">%s</span><span class="parroquia">%s</span></div>' \
         "$LOGO_URI" "$COMUNIDAD" "$PARROQUIA"
  [ -n "$KICKER" ] && printf '<div class="doc-kicker">%s</div>' "$KICKER"
  printf '%s\n' '</div>'
  printf '%s\n' '</td></tr></thead>'
  printf '<tfoot><tr><td><div class="pie"><span>%s</span><span>%s</span></div></td></tr></tfoot>\n' \
         "$PIE_IZQ" "$(date '+%d/%m/%Y')"
  printf '%s\n' '<tbody><tr><td>'
  cat "$CONTENIDO"
  printf '%s\n' '</td></tr></tbody></table></body></html>'
} > "$TMP/doc.html"

# Borrar la salida previa: sin esto, un fallo de Chrome deja el PDF viejo en su
# sitio y el chequeo de abajo lo da por bueno (regenerar un documento = falso OK).
rm -f "$SALIDA"
if ! "$CHROME" --headless --disable-gpu \
  --virtual-time-budget=15000 --no-pdf-header-footer \
  --print-to-pdf="$SALIDA" "file://$TMP/doc.html" 2>"$TMP/chrome.err"; then
  sed -n '1,20p' "$TMP/chrome.err" >&2
fi

[ -s "$SALIDA" ] || { echo "Chrome no produjo el PDF" >&2; sed -n '1,20p' "$TMP/chrome.err" >&2; exit 1; }
PAGS=$(python3 -c "import re,sys;print(len(re.findall(rb'/Type\s*/Page[^s]',open(sys.argv[1],'rb').read())))" "$SALIDA")
echo "OK  $SALIDA  ($PAGS páginas, $(( $(wc -c < "$SALIDA") / 1024 )) KB)"
