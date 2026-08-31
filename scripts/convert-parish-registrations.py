#!/usr/bin/env python3
"""Convert the parish's registration export into the CSV that emaus.cc imports.

Some parishes run walker registration on their own site (see
docs/features/external-walker-registration.md) and hand us an .xlsx. Its column
names and value encodings are nothing like the ones `mapToEnglishKeys()` expects
in apps/api/src/services/participantService.ts, so the file cannot be imported
as-is: it needs this translation first.

Usage:
    python3 scripts/convert-parish-registrations.py <export.xlsx> [output.csv]

No third-party dependencies: an .xlsx is a zip of XML, and the standard library
reads both. That matters because this runs on whichever machine happens to have
the export, not necessarily a set-up dev environment.

WHAT THIS CANNOT RECOVER
    The export carries only yes/no flags for health, never the free text. The
    walker who wrote "Metformin 850mg, one with meals" comes through as merely
    "takes medication". Kitchen and infirmary need the text, so it has to be
    collected another way. The script says so, per row, at the end.
"""

import csv
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# Spanish marital status -> the single letter the entity stores.
# Never derive this from the first letter: "Soltero" and "Separado-Divorciado"
# both start with S and would collapse into the same value.
MARITAL_STATUS = {
    "Soltero": "S",
    "Casado": "C",
    "Separado-Divorciado": "D",
    "Viudo": "V",
    "Otro": "O",
}

# The parish's shirt catalogue -> the sizes configured on the retreat.
# VERIFY THIS against the retreat's shirt types before importing: sizes are
# per-retreat (retreat_shirt_type.availableSizes) and differ by country.
SHIRT_SIZE = {
    "Chica (CH)": "CH",
    "Mediana (M)": "M",
    "Grande (L)": "L",
    "Extra grande (XL)": "XL",
    "Extra extra grande (XXL)": "XXL",
}

# The export writes one comma-separated cell; the importer reads four columns.
SACRAMENTS = {
    "Bautismo": "sacramentobaptism",
    "Comunión": "sacramentocommunion",
    "Confirmación": "sacramentoconfirmation",
    "Matrimonio": "sacramentomarriage",
}

# Column order of the produced CSV. These are the keys mapToEnglishKeys() reads.
OUTPUT_COLUMNS = [
    "tipousuario", "nombre", "apellidos", "apodo",
    "dia", "mes", "anio", "estadocivil",
    "dircalle", "dirnumero", "dircp", "dircolonia", "dirmunicipio", "direstado", "dirpais",
    "parroquia", "telcelular", "telcasa", "teltrabajo", "email", "ocupacion",
    "ronca", "medicinaespecial", "medicinacual", "medicinahora",
    "alimentosrestringidos", "alimentoscual",
    "sacramentobaptism", "sacramentocommunion", "sacramentoconfirmation", "sacramentomarriage",
    "emerg1nombre", "emerg1relacion", "emerg1telcelular", "emerg1telcasa", "emerg1teltrabajo", "emerg1email",
    "emerg2nombre", "emerg2relacion", "emerg2telcelular", "emerg2telcasa", "emerg2teltrabajo", "emerg2email",
    "camiseta", "invitadopor", "invitadaporemaus",
    "invtelcelular", "invtelcasa", "invteltrabajo", "invemail",
    "notas", "cancelado",
]


def read_xlsx(path):
    """Return the sheet as a list of rows, each row a list of cell strings."""
    archive = zipfile.ZipFile(path)

    shared = []
    if "xl/sharedStrings.xml" in archive.namelist():
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        for item in root.findall(f"{NS}si"):
            shared.append("".join(t.text or "" for t in item.iter(f"{NS}t")))

    def column_index(ref):
        letters = re.match(r"([A-Z]+)", ref).group(1)
        index = 0
        for char in letters:
            index = index * 26 + (ord(char) - 64)
        return index - 1

    sheets = sorted(n for n in archive.namelist() if n.startswith("xl/worksheets/sheet"))
    root = ET.fromstring(archive.read(sheets[0]))

    rows = []
    for row in root.iter(f"{NS}row"):
        cells = {}
        for cell in row.findall(f"{NS}c"):
            value_node = cell.find(f"{NS}v")
            inline_node = cell.find(f"{NS}is")
            if cell.get("t") == "s" and value_node is not None:
                value = shared[int(value_node.text)]
            elif inline_node is not None:
                value = "".join(t.text or "" for t in inline_node.iter(f"{NS}t"))
            elif value_node is not None:
                value = value_node.text or ""
            else:
                value = ""
            cells[column_index(cell.get("r"))] = value
        width = max(cells) + 1 if cells else 0
        rows.append([cells.get(i, "") for i in range(width)])
    return rows


def is_empty_row(record):
    """True for the padding rows the export writes past the last registration.

    The 2026-08-31 export carried 96 of them after 3 real rows — styled but
    blank. Left in, the importer reports them as "96 skipped: missing email",
    which buries the skips that actually mean something.
    """
    return not any((record.get(field) or "").strip()
                   for field in ("Folio", "Nombre", "Apellidos", "Correo"))


def yes_no(value):
    """'Sí'/'No' -> 'S'/'N'. Note the accent: a plain 'Si' never appears."""
    return "S" if value.strip().lower() in ("sí", "si") else "N"


def split_birth_date(value):
    """'14/03/1985' -> ('14', '03', '1985'). The export is unambiguous dd/mm/yyyy."""
    match = re.match(r"\s*(\d{1,2})/(\d{1,2})/(\d{4})", value or "")
    if not match:
        return "", "", ""
    return match.group(1), match.group(2), match.group(3)


def convert_row(source):
    """Translate one export row (dict keyed by Spanish header) into importer keys."""
    day, month, year = split_birth_date(source.get("Fecha de nacimiento", ""))

    out = {key: "" for key in OUTPUT_COLUMNS}
    out.update({
        # Without this the importer defaults to "server" and every walker would
        # silently land in the wrong list.
        "tipousuario": "3",
        "nombre": source.get("Nombre", ""),
        "apellidos": source.get("Apellidos", ""),
        "apodo": source.get("Apodo", ""),
        "dia": day, "mes": month, "anio": year,
        "estadocivil": MARITAL_STATUS.get(source.get("Estado civil", "").strip(), ""),
        "dircalle": source.get("Calle", ""),
        "dirnumero": source.get("Número", ""),
        "dircp": source.get("Código postal", ""),
        "dircolonia": source.get("Colonia", ""),
        "dirmunicipio": source.get("Ciudad", ""),
        "direstado": source.get("Estado", ""),
        "dirpais": source.get("País", ""),
        "parroquia": source.get("Parroquia", ""),
        "telcelular": source.get("Teléfono celular", ""),
        "telcasa": source.get("Teléfono de casa", ""),
        "teltrabajo": source.get("Teléfono del trabajo", ""),
        "email": source.get("Correo", ""),
        "ocupacion": source.get("Ocupación", ""),
        "ronca": yes_no(source.get("¿Ronca?", "")),
        "medicinaespecial": yes_no(source.get("¿Toma medicamento?", "")),
        # The parish collects drug and schedule in one free-text box, so it all
        # lands in `medicinacual`; `medicinahora` stays empty rather than
        # guessing where to split "one tablet with meals".
        "medicinacual": source.get("Medicamento (detalle)", ""),
        "alimentosrestringidos": yes_no(source.get("¿Tiene restricción alimentaria?", "")),
        "alimentoscual": source.get("Restricción alimentaria (detalle)", ""),
        "emerg1nombre": source.get("Contacto 1 · Nombre", ""),
        "emerg1relacion": source.get("Contacto 1 · Relación", ""),
        "emerg1telcelular": source.get("Contacto 1 · Celular", ""),
        "emerg1telcasa": source.get("Contacto 1 · Teléfono de casa", ""),
        "emerg1teltrabajo": source.get("Contacto 1 · Teléfono del trabajo", ""),
        "emerg1email": source.get("Contacto 1 · Correo", ""),
        "emerg2nombre": source.get("Contacto 2 · Nombre", ""),
        "emerg2relacion": source.get("Contacto 2 · Relación", ""),
        "emerg2telcelular": source.get("Contacto 2 · Celular", ""),
        "emerg2telcasa": source.get("Contacto 2 · Teléfono de casa", ""),
        "emerg2teltrabajo": source.get("Contacto 2 · Teléfono del trabajo", ""),
        "emerg2email": source.get("Contacto 2 · Correo", ""),
        "camiseta": SHIRT_SIZE.get(source.get("Talla", "").strip(), source.get("Talla", "")),
        "invitadopor": source.get("Quién la/lo invitó", ""),
        "invitadaporemaus": yes_no(source.get("¿Quien invitó pertenece a Emaús?", "")),
        "invtelcelular": source.get("Quien invitó · Celular", ""),
        "invtelcasa": source.get("Quien invitó · Teléfono de casa", ""),
        "invteltrabajo": source.get("Quien invitó · Teléfono del trabajo", ""),
        "invemail": source.get("Quien invitó · Correo", ""),
        # "Activa" is the healthy state; anything else means the person is out.
        "cancelado": "N" if source.get("Estado de la inscripción", "").strip() == "Activa" else "S",
    })

    for label, column in SACRAMENTS.items():
        if label in source.get("Sacramentos", ""):
            out[column] = "S"

    # The folio is how the parish refers to this person and how their payment is
    # reconciled, so it must survive the trip. There is no column for it.
    notes = [f"Folio {source['Folio']}"] if source.get("Folio") else []
    # No destination in Participant: the model has medication and dietary fields
    # but nothing for a general health condition, so it rides along in the notes.
    if yes_no(source.get("¿Tiene condición médica?", "")) == "S":
        detail = source.get("Condición médica (detalle)", "").strip()
        notes.append(f"CONDICIÓN MÉDICA: {detail}" if detail else "TIENE CONDICIÓN MÉDICA (sin detalle)")
    if source.get("Forma de pago"):
        notes.append(f"Forma de pago: {source['Forma de pago']}")
    if source.get("Estado del pago"):
        notes.append(f"Pago: {source['Estado del pago']}")
    out["notas"] = " | ".join(notes)

    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    source_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "inscripciones-para-importar.csv"

    rows = read_xlsx(source_path)
    if len(rows) < 2:
        print("El archivo no tiene filas de datos.")
        sys.exit(1)

    headers = rows[0]
    all_records = [dict(zip(headers, row + [""] * (len(headers) - len(row)))) for row in rows[1:]]

    records = [r for r in all_records if not is_empty_row(r)]
    padding = len(all_records) - len(records)

    if not records:
        print("El archivo no tiene registros con datos.")
        sys.exit(1)

    converted = [convert_row(record) for record in records]

    # utf-8-sig: without the BOM, Excel opens the file mangling every accent.
    with open(output_path, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(converted)

    print(f"✓ {len(converted)} registros -> {output_path}")
    if padding:
        print(f"  ({padding} filas vacías del export descartadas)")

    missing_email = [r["Folio"] for r in records if not r.get("Correo", "").strip()]
    if missing_email:
        # The importer keys its upsert on email and skips rows without one.
        print(f"\n⚠️  SIN CORREO (el importador los saltará): {', '.join(missing_email)}")

    unmapped = sorted({r.get("Talla", "") for r in records
                       if r.get("Talla", "").strip() and r.get("Talla", "").strip() not in SHIRT_SIZE})
    if unmapped:
        print(f"\n⚠️  TALLAS SIN MAPEAR (pasan tal cual): {', '.join(unmapped)}")

    # Exports before 2026-08-31 14:31 lacked the detail columns entirely. If they
    # are missing, every "yes" is unusable and that has to be shouted, not hinted.
    health_pairs = [
        ("¿Toma medicamento?", "Medicamento (detalle)"),
        ("¿Tiene restricción alimentaria?", "Restricción alimentaria (detalle)"),
        ("¿Tiene condición médica?", "Condición médica (detalle)"),
    ]
    if not any(detail in headers for _, detail in health_pairs):
        print(
            "\n⚠️  EXPORT ANTIGUO: no trae las columnas de detalle de salud.\n"
            "    Sin ellas sabes quién se medica pero no con qué. Pide un export nuevo."
        )
    else:
        # A "yes" with an empty box is worse than a "no": it promises information
        # that nobody wrote down, and kitchen/infirmary plan around it.
        blank = [
            f"{r['Folio']} ({flag.strip('¿?')})"
            for r in records for flag, detail in health_pairs
            if yes_no(r.get(flag, "")) == "S" and not r.get(detail, "").strip()
        ]
        if blank:
            print(f"\n⚠️  MARCARON 'Sí' SIN ESCRIBIR EL DETALLE: {', '.join(blank)}")

    # The export cannot distinguish a rejected payment from one never attempted:
    # both read "Pendiente". Verified on 2026-08-31 after approving one payment
    # and rejecting another.
    pending = [r["Folio"] for r in records if r.get("Estado del pago", "").strip() == "Pendiente"]
    if pending:
        print(
            f"\nℹ️  PAGO PENDIENTE: {', '.join(pending)}\n"
            "    Ojo: un pago RECHAZADO también aparece como 'Pendiente'. Quien subió un\n"
            "    comprobante y se lo rechazaron cree que ya pagó. Eso hay que verlo en el\n"
            "    backoffice, no aquí."
        )


if __name__ == "__main__":
    main()
