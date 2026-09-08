#!/usr/bin/env bash
#
# Asistente para cargar caminantes desde el registro de la parroquia.
#
#   bash scripts/walkers-import.sh convert   # elegir el Excel y convertirlo
#   bash scripts/walkers-import.sh check     # comprobar ANTES de importar
#   bash scripts/walkers-import.sh verify    # comprobar DESPUÉS de importar
#
# Existe para que nadie tenga que teclear la ruta del .xlsx ni el uuid del
# retiro: los dos se eligen de una lista. Escribirlos a mano es donde uno se
# equivoca — y un uuid equivocado importa a los caminantes en OTRO retiro.
#
# Detalle del proceso: docs/features/parish-walker-import.md

set -euo pipefail

DOWNLOADS="${HOME}/Downloads"
CSV_OUT="inscripciones.csv"
# Recuerda la última elección entre un comando y el siguiente, para no volver a
# preguntar el retiro entre `check` y `verify`.
STATE="/tmp/emaus-walkers.env"

azul()  { printf "\033[1;34m%s\033[0m\n" "$1"; }
gris()  { printf "\033[0;90m%s\033[0m\n" "$1"; }
error() { printf "\033[1;31m%s\033[0m\n" "$1" >&2; }

[ -f "$STATE" ] && . "$STATE"

# ── Elegir el Excel ──────────────────────────────────────────────────────────

elegir_xlsx() {
  local hoy=() recientes=() f
  # -mtime -1 = modificados en las últimas 24h. En macOS no hay -newermt.
  while IFS= read -r f; do hoy+=("$f"); done < <(
    find "$DOWNLOADS" -maxdepth 1 -name "inscripciones-*.xlsx" -mtime -1 2>/dev/null | sort -r
  )
  while IFS= read -r f; do recientes+=("$f"); done < <(
    find "$DOWNLOADS" -maxdepth 1 -name "inscripciones-*.xlsx" 2>/dev/null | sort -r | head -8
  )

  local lista=()
  if [ ${#hoy[@]} -gt 0 ]; then
    lista=("${hoy[@]}")
    azul "Descargas de hoy:" >&2
  elif [ ${#recientes[@]} -gt 0 ]; then
    lista=("${recientes[@]}")
    azul "No hay ninguno de hoy. Los más recientes:" >&2
  else
    error "No encuentro ningún inscripciones-*.xlsx en $DOWNLOADS."
    error "Descarga el export desde el sitio de la parroquia y vuelve a intentarlo."
    exit 1
  fi

  local i=1
  for f in "${lista[@]}"; do
    printf "  %d) %s  \033[0;90m(%s)\033[0m\n" \
      "$i" "$(basename "$f")" "$(date -r "$f" '+%d/%m %H:%M')" >&2
    i=$((i + 1))
  done

  local eleccion=1
  if [ ${#lista[@]} -gt 1 ]; then
    printf "\nCuál uso [1-%d]: " "${#lista[@]}" >&2
    read -r eleccion
    eleccion="${eleccion:-1}"
  else
    gris "  (es el único, lo uso)" >&2
  fi

  if ! [[ "$eleccion" =~ ^[0-9]+$ ]] || [ "$eleccion" -lt 1 ] || [ "$eleccion" -gt ${#lista[@]} ]; then
    error "Opción inválida."
    exit 1
  fi
  echo "${lista[$((eleccion - 1))]}"
}

# ── Elegir el retiro ─────────────────────────────────────────────────────────

elegir_retiro() {
  local salida
  # Read-only: este script nunca escribe en la base.
  salida=$(python3 - <<'PY'
import os, sqlite3, sys
ruta = os.environ.get("EMAUS_DB") or os.path.join("apps", "api", "database.sqlite")
if not os.path.exists(ruta):
    sys.exit("SIN_BASE")
db = sqlite3.connect(f"file:{os.path.abspath(ruta)}?mode=ro", uri=True)
filas = db.execute("""
    SELECT id, parish, date(startDate), retreat_number_version,
           (SELECT COUNT(*) FROM retreat_participants rp WHERE rp.retreatId = retreat.id)
    FROM retreat
    WHERE date(endDate) >= date('now')
    ORDER BY startDate
""").fetchall()
db.close()
for r in filas:
    print("\t".join(str(c or "") for c in r))
PY
  ) || { error "No pude leer la base (apps/api/database.sqlite)."; exit 1; }

  if [ -z "$salida" ]; then
    error "No hay ningún retiro en curso o próximo en la base."
    exit 1
  fi

  local ids=() etiquetas=() linea
  while IFS=$'\t' read -r id parroquia inicio version total; do
    ids+=("$id")
    etiquetas+=("$parroquia ${version:+· $version} · empieza $inicio · $total inscritos")
  done <<< "$salida"

  azul "Retiros:" >&2
  local i=1
  for linea in "${etiquetas[@]}"; do
    printf "  %d) %s\n" "$i" "$linea" >&2
    i=$((i + 1))
  done

  local eleccion=1
  if [ ${#ids[@]} -gt 1 ]; then
    printf "\nCuál [1-%d]: " "${#ids[@]}" >&2
    read -r eleccion
    eleccion="${eleccion:-1}"
  else
    gris "  (es el único próximo, lo uso)" >&2
  fi

  if ! [[ "$eleccion" =~ ^[0-9]+$ ]] || [ "$eleccion" -lt 1 ] || [ "$eleccion" -gt ${#ids[@]} ]; then
    error "Opción inválida."
    exit 1
  fi
  echo "${ids[$((eleccion - 1))]}"
}

recordar() { printf 'RETIRO=%s\nCSV=%s\n' "${1:-${RETIRO:-}}" "${2:-${CSV:-}}" > "$STATE"; }

# ── Comandos ─────────────────────────────────────────────────────────────────

case "${1:-}" in
  convert)
    XLSX=$(elegir_xlsx)
    echo
    azul "Convirtiendo $(basename "$XLSX")…"
    python3 scripts/convert-parish-registrations.py "$XLSX" "$CSV_OUT"
    recordar "${RETIRO:-}" "$CSV_OUT"
    echo
    gris "Siguiente:  make walkers-check"
    ;;

  check|verify)
    CSV="${CSV:-$CSV_OUT}"
    if [ ! -f "$CSV" ]; then
      error "No encuentro $CSV. Corré primero:  make walkers-convert"
      exit 1
    fi
    RETIRO=$(elegir_retiro)
    recordar "$RETIRO" "$CSV"
    echo
    if [ "$1" = "check" ]; then
      python3 scripts/check-import.py --before "$CSV" --retreat "$RETIRO" ${EMAUS_DB:+--db "$EMAUS_DB"}
      echo
      gris "Si todo está en orden: importá el CSV desde Caminantes → Importar Participantes,"
      gris "y al terminar corré:  make walkers-verify"
    else
      python3 scripts/check-import.py --after "$CSV" --retreat "$RETIRO" ${EMAUS_DB:+--db "$EMAUS_DB"}
    fi
    ;;

  *)
    error "Uso: $0 {convert|check|verify}"
    exit 1
    ;;
esac
