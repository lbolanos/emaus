#!/usr/bin/env python3
"""Check a walker import against the database, before and after running it.

The import loses people quietly: the endpoint answers 200, `skippedCount` comes
back 0 or 1, and nobody looks. The troubleshooting skill documents six distinct
causes (§25). This script turns "did everyone make it in?" from a manual head
count into a command.

Usage:
    python3 scripts/check-import.py --before inscripciones.csv --retreat <uuid>
    python3 scripts/check-import.py --after  inscripciones.csv --retreat <uuid>

The retreat id is the uuid in the dashboard URL:
    /app/retreats/<uuid>/dashboard

Reads the database directly and READ-ONLY, so it works whether or not the API is
running, and it cannot corrupt a live WAL database.
"""

import argparse
import csv
import os
import re
import sqlite3
import sys

DEFAULT_DB = os.environ.get("EMAUS_DB") or os.path.join("apps", "api", "database.sqlite")


def open_db(path):
    """Open the SQLite file read-only. Never opens a write transaction."""
    if not os.path.exists(path):
        sys.exit(f"No encuentro la base en {path}. Pásala con --db.")
    # mode=ro means a write is impossible even by accident, which matters because
    # this database is shared with a running dev server.
    return sqlite3.connect(f"file:{os.path.abspath(path)}?mode=ro", uri=True)


def read_rows(csv_path):
    with open(csv_path, encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def folio_of(row):
    """The parish folio travels inside `notas`, as 'Folio EH-0005 | ...'."""
    match = re.search(r"Folio\s+(\S+)", row.get("notas", "") or "")
    return match.group(1) if match else "(sin folio)"


def label(row):
    """Identify a row without printing personal data beyond what the operator needs."""
    return f"{folio_of(row)} · {row.get('nombre', '').strip()} {row.get('apellidos', '').strip()}".strip()


def check_before(db, rows, retreat_id):
    problems = []

    retreat = db.execute(
        "SELECT parish, isPublic, date(endDate) FROM retreat WHERE id = ?", (retreat_id,)
    ).fetchone()
    if not retreat:
        sys.exit(f"No existe el retiro {retreat_id}")
    parish, is_public, end_date = retreat
    print(f"Retiro: {parish}  (termina {end_date})")

    # §25.2 — createParticipant calls assertRetreatAcceptsRegistrations on every
    # row with no exception for the import: if the retreat is closed, ALL rows
    # fail, not some.
    if not is_public:
        problems.append(
            "El retiro NO está marcado como público. Fallarán TODAS las filas, no algunas."
        )
    else:
        print("  ✓ el retiro acepta registros")

    # The importer trusts whatever size it receives and never checks it against
    # the retreat's catalogue, so a wrong mapping is only discovered when the
    # shirts are ordered.
    catalogue = set()
    for (sizes,) in db.execute(
        "SELECT availableSizes FROM retreat_shirt_type WHERE retreatId = ?", (retreat_id,)
    ):
        if sizes:
            catalogue.update(re.findall(r'"([^"]+)"', sizes))
    used = {r.get("camiseta", "").strip() for r in rows if r.get("camiseta", "").strip()}
    unknown = sorted(used - catalogue) if catalogue else []
    if not catalogue:
        print("  ⚠️  el retiro no tiene tallas configuradas; no puedo comprobar las camisetas")
    elif unknown:
        problems.append(
            f"Tallas que el retiro no conoce: {', '.join(unknown)}. "
            f"Su catálogo es {', '.join(sorted(catalogue))}. "
            "Ajustá SHIRT_SIZE en convert-parish-registrations.py."
        )
    else:
        print(f"  ✓ todas las tallas existen en el catálogo ({', '.join(sorted(catalogue))})")

    # §25.1 — the conversor already resolves these, so anything left here means
    # the file was not produced by it, or was edited afterwards.
    seen = {}
    dupes = []
    for row in rows:
        email = row.get("email", "").strip().lower()
        if not email:
            continue
        if email in seen:
            dupes.append(f"{label(row)} comparte correo con {seen[email]}")
        else:
            seen[email] = label(row)
    if dupes:
        problems.append(
            "Correos repetidos: el importador los tomará como la MISMA persona.\n      "
            + "\n      ".join(dupes)
        )
    else:
        print(f"  ✓ {len(seen)} correos, todos distintos")

    no_email = [label(r) for r in rows if not r.get("email", "").strip()]
    if no_email:
        problems.append("Sin correo (el importador los salta): " + ", ".join(no_email))

    # §25.3 — the race only bites on an update followed by a create, so knowing
    # whether the sheet is mixed tells the operator how carefully to check after.
    existing = set()
    for row in rows:
        email = row.get("email", "").strip().lower()
        if email and db.execute(
            "SELECT 1 FROM participants p JOIN retreat_participants rp"
            "  ON rp.participantId = p.id AND rp.retreatId = ?"
            " WHERE LOWER(p.email) = ?",
            (retreat_id, email),
        ).fetchone():
            existing.add(email)
    updates, creates = len(existing), len(rows) - len(existing)
    print(f"  · {creates} altas nuevas y {updates} actualizaciones")
    if updates and creates:
        print(
            "  ⚠️  hoja mixta: hay una carrera conocida en la transición actualización → alta\n"
            "      (troubleshooting §25.3). Corré --after al terminar, sin falta."
        )

    return problems


def check_after(db, rows, retreat_id):
    missing = []
    for row in rows:
        email = row.get("email", "").strip().lower()
        if not email:
            missing.append((label(row), "no traía correo"))
            continue
        found = db.execute(
            "SELECT 1 FROM participants p JOIN retreat_participants rp"
            "  ON rp.participantId = p.id AND rp.retreatId = ?"
            " WHERE LOWER(p.email) = ?",
            (retreat_id, email),
        ).fetchone()
        if not found:
            missing.append((label(row), "no está en el retiro"))

    total = db.execute(
        "SELECT COUNT(*) FROM retreat_participants WHERE retreatId = ?", (retreat_id,)
    ).fetchone()[0]
    walkers = db.execute(
        "SELECT COUNT(*) FROM retreat_participants WHERE retreatId = ? AND type = 'walker'",
        (retreat_id,),
    ).fetchone()[0]
    print(f"En el retiro: {total} participantes, {walkers} caminantes")
    print(f"En el archivo: {len(rows)} filas")

    if missing:
        print(f"\n❌ FALTAN {len(missing)} de {len(rows)}:")
        for who, why in missing:
            print(f"    {who} — {why}")
        return [f"{len(missing)} filas del archivo no llegaron al retiro"]

    print(f"\n✅ las {len(rows)} filas del archivo están en el retiro")
    return []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--before", metavar="CSV", help="comprobar antes de importar")
    group.add_argument("--after", metavar="CSV", help="comprobar después de importar")
    parser.add_argument("--retreat", required=True, help="uuid del retiro")
    parser.add_argument("--db", default=DEFAULT_DB, help=f"ruta a la base (por defecto {DEFAULT_DB})")
    args = parser.parse_args()

    csv_path = args.before or args.after
    rows = read_rows(csv_path)
    if not rows:
        sys.exit(f"{csv_path} no tiene filas de datos.")

    db = open_db(args.db)
    try:
        problems = (
            check_before(db, rows, args.retreat)
            if args.before
            else check_after(db, rows, args.retreat)
        )
    finally:
        db.close()

    if problems:
        print("\n🚨 NO IMPORTES TODAVÍA:" if args.before else "\n🚨 REVISÁ ESTO:")
        for problem in problems:
            print(f"  · {problem}")
        sys.exit(1)

    print("\nTodo en orden." if args.before else "")


if __name__ == "__main__":
    main()
