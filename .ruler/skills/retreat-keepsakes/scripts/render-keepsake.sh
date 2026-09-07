#!/usr/bin/env bash
# Monta el recuerdo de un retiro: foto de grupo + rotulo, en vertical.
# La foto va completa sobre un fondo hecho con ella misma difuminada, asi que
# una foto horizontal se vuelve vertical sin recortar a nadie del grupo.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$SKILL_DIR/assets/keepsake.html"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

PHOTO=""; KICKER=""; HEADLINE=""; DATES=""; OUT=""; SLUG="recuerdo"
FORMATS="story,feed"; SCALE=2; EMBLEM=""; JPEG=1

usage() {
  cat <<'USAGE'
Uso:
  render-keepsake.sh --photo FOTO --headline TITULO --dates FECHAS --out DIR [opciones]

Obligatorio:
  --photo FILE      Foto de grupo (JPEG/PNG). Usa el ORIGINAL de la camara, no
                    el reenvio de WhatsApp (ver SKILL.md, seccion "La fuente").
  --headline TEXTO  Titulo grande, p.ej. "Veracruz XXIII"
  --dates TEXTO     Fechas, p.ej. "del 4 al 6 de septiembre 2026"
  --out DIR         Directorio de salida (se crea)

Opcional:
  --kicker TEXTO    Linea superior (default "Retiro de Emaus Hombres")
  --slug NOMBRE     Sufijo del archivo (default "recuerdo")
  --formats LISTA   story,feed (default ambos). story=9:16, feed=4:5
  --scale N         Factor de resolucion (default 2 -> 2160x3840)
  --emblem FILE     PNG del emblema; "none" para omitirlo.
                    Default: apps/web/public/crossRoseButtT.png del repo
  --no-jpeg         No generar el JPEG de envio
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --photo)    PHOTO="$2"; shift 2 ;;
    --kicker)   KICKER="$2"; shift 2 ;;
    --headline) HEADLINE="$2"; shift 2 ;;
    --dates)    DATES="$2"; shift 2 ;;
    --out)      OUT="$2"; shift 2 ;;
    --slug)     SLUG="$2"; shift 2 ;;
    --formats)  FORMATS="$2"; shift 2 ;;
    --scale)    SCALE="$2"; shift 2 ;;
    --emblem)   EMBLEM="$2"; shift 2 ;;
    --no-jpeg)  JPEG=0; shift ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "opcion desconocida: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$PHOTO" ] && [ -n "$HEADLINE" ] && [ -n "$DATES" ] && [ -n "$OUT" ] || {
  echo "faltan argumentos obligatorios" >&2; usage >&2; exit 2; }
[ -f "$PHOTO" ] || { echo "no existe la foto: $PHOTO" >&2; exit 2; }
[ -f "$TEMPLATE" ] || { echo "no existe la plantilla: $TEMPLATE" >&2; exit 2; }
KICKER="${KICKER:-Retiro de Emaus Hombres}"

# Emblema: por defecto el de la app, resuelto desde la raiz del repo para que
# funcione igual en un worktree.
if [ -z "$EMBLEM" ]; then
  REPO="$(git -C "$SKILL_DIR" rev-parse --show-toplevel 2>/dev/null || echo "")"
  CAND="$REPO/apps/web/public/crossRoseButtT.png"
  [ -n "$REPO" ] && [ -f "$CAND" ] && EMBLEM="$CAND" || EMBLEM="none"
fi

# Avisar si la foto es un reenvio comprimido: es la causa numero uno de que el
# recuerdo no aguante que lo amplien.
read -r PW PH PQ <<EOF
$(magick identify -format "%w %h %Q" "$PHOTO")
EOF
if [ "$PQ" -le 60 ] || [ "$PW" -le 1600 ]; then
  echo "AVISO: la foto es ${PW}x${PH} q=${PQ}. Parece un reenvio de WhatsApp."
  echo "       Pedi el original de la camara antes de dar esto por terminado."
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

render() {
  local fmt="$1" w h
  case "$fmt" in
    story) w=1080; h=1920
           local pad=92 padbot=76 closerw=210 emblem=104 emblemgap=34
           local kicker=40 kicktrack=9 head=126 headtrack=2 headgap=14
           local rulegap=20 rulemargin=34 rulew=150 dot=9 dates=46 datetrack=0.5
           local figgap=54 figw=1040 frame=12 radius=20 innerradius=12 ;;
    feed)  w=1080; h=1350
           local pad=58 padbot=50 closerw=170 emblem=84 emblemgap=24
           local kicker=33 kicktrack=7 head=100 headtrack=2 headgap=10
           local rulegap=16 rulemargin=24 rulew=120 dot=8 dates=38 datetrack=0.5
           local figgap=38 figw=990 frame=10 radius=18 innerradius=10 ;;
    *) echo "formato desconocido: $fmt (usa story o feed)" >&2; return 2 ;;
  esac

  local html="$WORK/page-$SLUG-$fmt.html"
  sed -e "s|__W__|$w|g" -e "s|__H__|$h|g" \
      -e "s|__PAD__|$pad|g" -e "s|__PADBOT__|$padbot|g" -e "s|__CLOSERW__|$closerw|g" \
      -e "s|__EMBLEM__|$emblem|g" -e "s|__EMBLEMGAP__|$emblemgap|g" \
      -e "s|__KICKER__|$kicker|g" -e "s|__KICKTRACK__|$kicktrack|g" \
      -e "s|__HEAD__|$head|g" -e "s|__HEADTRACK__|$headtrack|g" -e "s|__HEADGAP__|$headgap|g" \
      -e "s|__RULEGAP__|$rulegap|g" -e "s|__RULEMARGIN__|$rulemargin|g" \
      -e "s|__RULEW__|$rulew|g" -e "s|__DOT__|$dot|g" \
      -e "s|__DATES__|$dates|g" -e "s|__DATETRACK__|$datetrack|g" \
      -e "s|__FIGGAP__|$figgap|g" -e "s|__FIGW__|$figw|g" -e "s|__FRAME__|$frame|g" \
      -e "s|__RADIUS__|$radius|g" -e "s|__INNERRADIUS__|$innerradius|g" \
      "$TEMPLATE" > "$html"

  # Textos e imagenes van por Python: un data URI de varios MB no cabe como
  # argumento de proceso (ARG_MAX), y el texto necesita escaparse.
  python3 - "$html" "$PHOTO" "$EMBLEM" "$KICKER" "$HEADLINE" "$DATES" <<'PY'
import sys, base64, mimetypes, html as H
path, photo, emblem, kicker, headline, dates = sys.argv[1:7]

def data_uri(p):
    mime = mimetypes.guess_type(p)[0] or 'application/octet-stream'
    with open(p, 'rb') as fh:
        return 'data:%s;base64,%s' % (mime, base64.b64encode(fh.read()).decode('ascii'))

s = open(path, encoding='utf-8').read()
s = s.replace('__PHOTO__', data_uri(photo))
tag = '' if emblem == 'none' else '<img class="emblem" src="%s" alt="">' % data_uri(emblem)
s = s.replace('__EMBLEM_TAG__', tag)
for ph, val in (('__KICKER_TEXT__', kicker), ('__HEADLINE_TEXT__', headline),
                ('__DATES_TEXT__', dates)):
    s = s.replace(ph, H.escape(val))
open(path, 'w', encoding='utf-8').write(s)
PY

  local shot="$OUT/$SLUG-$fmt.png"
  rm -f "$shot"
  "$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
    --user-data-dir="$WORK/.chrome-$SLUG-$fmt" --hide-scrollbars \
    --force-device-scale-factor="$SCALE" --default-background-color=00000000 \
    --virtual-time-budget=4000 --window-size="$w,$h" --screenshot="$shot" \
    "file://$html" >/dev/null 2>&1 &
  local pid=$!

  # Chrome escribe el PNG y NO termina: bloquearia el render siguiente del lote.
  # Se espera a que el tamano del archivo se estabilice y se lo mata.
  local prev=0 cur=0 stable=0
  for _ in $(seq 1 90); do
    sleep 1
    cur=$(stat -f%z "$shot" 2>/dev/null || echo 0)
    if [ "$cur" -gt 0 ] && [ "$cur" = "$prev" ]; then
      stable=$((stable + 1)); [ "$stable" -ge 2 ] && break
    else stable=0; fi
    prev=$cur
  done
  kill -9 $pid 2>/dev/null || true
  wait $pid 2>/dev/null || true

  [ -s "$shot" ] || { echo "  FALLO $shot" >&2; return 1; }
  echo "  OK $shot  ($(magick identify -format '%wx%h' "$shot"))"

  if [ "$JPEG" -eq 1 ]; then
    local jpg="${shot%.png}.jpg"
    magick "$shot" -quality 92 -sampling-factor 4:4:4 -strip "$jpg"
    echo "  OK $jpg  (para enviar)"
  fi
}

IFS=',' read -ra WANTED <<< "$FORMATS"
for f in "${WANTED[@]}"; do render "$f"; done

cat <<'NOTE'

Recorda: enviar como DOCUMENTO, no como foto. Si se manda como foto, WhatsApp
recomprime a q50 y deshace la definicion.
NOTE
