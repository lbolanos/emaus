#!/usr/bin/env bash
# Prepara el encuadre de una foto de grupo: informa la fuente, perfila la
# imagen por franjas y deja una version con rejilla para decidir el recorte
# mirando, que es como se decide de verdad.
#
# Lo que la medicion SI sostiene: el cielo plano de arriba (desviacion estandar
# muy baja) se detecta solo. Lo que NO: el pico de desviacion no es la gente
# -- el follaje y la fachada tienen tanto o mas detalle. Para ubicar al grupo
# hay que mirar la rejilla.
set -euo pipefail

PHOTO="${1:-}"; BANDS="${2:-20}"; OUTDIR="${3:-/tmp/chrome}"
[ -f "$PHOTO" ] || { echo "uso: measure-photo.sh FOTO [n_franjas] [dir_salida]" >&2; exit 2; }
mkdir -p "$OUTDIR"

read -r W H Q <<EOF
$(magick identify -format "%w %h %Q" "$PHOTO")
EOF
echo "$PHOTO"
echo "  ${W}x${H}  calidad JPEG ${Q}"
if [ "$Q" -le 60 ] || [ "$W" -le 1600 ]; then
  echo "  AVISO: parece un reenvio de WhatsApp. Pedi el original de la camara"
  echo "         antes de montar algo que se vaya a ampliar."
fi
echo

STEP=$((H / BANDS))
echo "  Perfil vertical (desviacion estandar x100, franjas de ${STEP}px):"
SDS=()
for y in $(seq 0 "$STEP" $((H - STEP))); do
  sd=$(magick "$PHOTO" -crop "${W}x${STEP}+0+${y}" +repage -colorspace Gray \
       -format "%[fx:standard_deviation*100]" info:)
  SDS+=("$y:$sd")
  bar=$(printf '%.0s#' $(seq 1 $(printf '%.0f' "$sd")) 2>/dev/null || true)
  printf "    y=%5d  sd=%5.1f  %s\n" "$y" "$sd" "$bar"
done
echo

# Cielo plano arriba: franjas contiguas desde y=0 por debajo de la mitad de la
# mediana. Es la unica frontera que el numero identifica sin ambiguedad.
MEDIAN=$(printf '%s\n' "${SDS[@]}" | cut -d: -f2 | sort -n | awk '{a[NR]=$1} END{print a[int(NR/2)+1]}')
THRESH=$(awk -v m="$MEDIAN" 'BEGIN{printf "%.3f", m/2}')
SKY=0
for e in "${SDS[@]}"; do
  y="${e%%:*}"; sd="${e#*:}"
  if awk -v a="$sd" -v t="$THRESH" 'BEGIN{exit !(a<t)}'; then SKY=$((y + STEP)); else break; fi
done
printf "  Cielo plano arriba: los primeros %d px (umbral sd<%.1f, mediana %.1f).\n" \
  "$SKY" "$THRESH" "$MEDIAN"
echo "  Abajo, las franjas de sd media y estable suelen ser cesped: mirarlas."
echo

BASE="$(basename "${PHOTO%.*}")"
GRID="$OUTDIR/${BASE}-rejilla.png"
GH=$((1000 * H / W))
DRAW=""
for p in $(seq 10 10 90); do
  yy=$((GH * p / 100))
  DRAW="$DRAW line 0,$yy 1000,$yy"
done
# Sin fallback: si el dibujo falla queremos verlo, no una foto lisa que parece
# una rejilla vacia.
magick "$PHOTO" -resize 1000x -fill none -stroke '#FF3B30' -strokewidth 2 \
  -draw "$DRAW" "$GRID"
REDPX=$(magick "$GRID" -fuzz 20% -fill white -opaque '#FF3B30' -fill black \
        +opaque white -format "%[fx:mean*w*h]" info: 2>/dev/null || echo 0)
awk -v n="$REDPX" 'BEGIN{exit !(n>500)}' \
  || { echo "  ERROR: la rejilla salio sin lineas ($REDPX px marcados)" >&2; exit 1; }
echo "  Rejilla cada 10% de la altura -> $GRID"
echo "  (cada linea = ${H} / 10 = $((H/10)) px de la original)"
echo
echo "  Regla del recorte, aprendida a golpes: en una foto de grupo la gente"
echo "  llega casi a los bordes laterales. Estrechar el ancho corta a alguien,"
echo "  asi que para quitar cesped se ABRE la proporcion (3:2, 16:9) y se toca"
echo "  solo la altura. Verificalo recortando la franja del grupo y mirandola."
