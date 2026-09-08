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
#
# These are the Mexican sizes (S/M/G/X/2), which is what Del Valle II uses:
#   SELECT availableSizes FROM retreat_shirt_type WHERE retreatId = '<retiro>'
#
# CHECK THIS before every import. Sizes live per-retreat in
# retreat_shirt_type.availableSizes and differ by country — Colombia uses
# S/M/L/XL/XXL. The first version of this script mapped to the Colombian set and
# would have written "L" into a retreat whose catalogue only knows "G": the
# importer trusts whatever it receives, so the size lands orphaned and nobody
# finds out until the shirts are ordered.
SHIRT_SIZE = {
    "Chica (CH)": "S",
    "Mediana (M)": "M",
    "Grande (L)": "G",
    "Extra grande (XL)": "X",
    "Extra extra grande (XXL)": "2",
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
    "montopago", "fechapago", "notas", "cancelado",
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


def money(value):
    """'3,100.00' -> '3100.00'. Strips the thousands separator.

    Not cosmetic: the importer does `parseFloat(montopago)`, and parseFloat
    stops at the comma. '3,100.00' would become 3 — a payment of three pesos
    that passes the `amount > 0` check and leaves the walker owing 3,097.
    """
    cleaned = (value or "").replace(",", "").replace("$", "").strip()
    try:
        return f"{float(cleaned):.2f}" if cleaned else ""
    except ValueError:
        return ""


def registration_date_iso(value):
    """'02/09/2026 13:14' -> '2026-09-02T12:00:00'.

    Used as the payment date. It is NOT when the money moved — the export does
    not carry that — it is when the person registered. That is deliberate: the
    parish keeps the real accounting, and what this system needs the payment for
    is knowing the walker already paid so reception does not charge them twice.
    Without a date the importer skips the payment entirely and everyone shows up
    owing the full fee.

    Noon, not midnight: the importer does `new Date(...)`, and a bare date is
    parsed as UTC midnight, which renders as the previous day in México.
    """
    match = re.match(r"\s*(\d{1,2})/(\d{1,2})/(\d{4})", value or "")
    if not match:
        return ""
    day, month, year = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}T12:00:00"


def split_birth_date(value):
    """'14/03/1985' -> ('14', '03', '1985'). The export is unambiguous dd/mm/yyyy."""
    match = re.match(r"\s*(\d{1,2})/(\d{1,2})/(\d{4})", value or "")
    if not match:
        return "", "", ""
    return match.group(1), match.group(2), match.group(3)


def sanitize_for_csv(value):
    """Make one value survive the CSV path of ImportParticipantsModal.

    That parser has two behaviours the xlsx path does not (troubleshooting §25.6,
    both found importing the Veracruz export):

    - It splits the file on newlines BEFORE separating fields, so a newline inside
      a quoted value shifts every column from there on. The health detail columns
      carry real newlines — EH-0003 had "Metformina 850 mg…\nAlergia a la
      penicilina" — so this is not hypothetical.
    - `values[index] || null` turns an empty cell into NULL, and the importer
      writes that NULL into NOT NULL columns, killing the row. In Veracruz that
      was 272 mandatory cells.

    A single space, not a dash: it survives the `|| null`, and the `str()` of
    mapToEnglishKeys trims it back to an empty string — same result as the xlsx
    path, and nothing visible in the import preview.
    """
    flattened = " / ".join(
        part.strip() for part in str(value or "").splitlines() if part.strip()
    )
    return flattened if flattened else " "


def resolve_shared_emails(records):
    """Give a unique email to each person who shares one, in place.

    The importer upserts on LOWER(email) within the retreat and there is a unique
    index on (email, retreatId), so N people sharing an address enter as ONE.
    It is not an edge case: in parishes where the coordinator signs everyone up
    with his own address it is massive — 18 people under `notengo@gmail.com` in
    the Veracruz export (troubleshooting §25.1).

    Two rows with the same email are only merged on purpose when they are the
    SAME person — a cancellation and its re-registration reconcile that way. So
    the discriminator is the full name: same name keeps the shared address,
    different name gets a synthetic one built from the mobile number.

    The original address is kept and ends up in `notas`, so nothing is lost.
    """
    seen = {}          # email -> (folio, full name)
    taken = set()      # synthetic addresses already handed out
    resolved = []

    for record in records:
        email = record.get("Correo", "").strip().lower()
        if not email:
            continue
        name = f"{record.get('Nombre', '')} {record.get('Apellidos', '')}".strip().upper()
        folio = record.get("Folio", "?")

        if email not in seen:
            seen[email] = (folio, name)
            taken.add(email)
            continue

        first_folio, first_name = seen[email]
        if name == first_name:
            # Same person twice: leave it, that is how the importer reconciles them.
            continue

        mobile = re.sub(r"\D", "", record.get("Teléfono celular", "")) or re.sub(
            r"\W", "", folio
        ).lower()
        candidate = f"{mobile}@sincorreo.emaus.cc"
        suffix = 2
        while candidate in taken:
            candidate = f"{mobile}-{suffix}@sincorreo.emaus.cc"
            suffix += 1

        record["__correo_original"] = record.get("Correo", "")
        record["Correo"] = candidate
        taken.add(candidate)
        resolved.append((folio, first_folio, candidate))

    return resolved


def convert_row(source):
    """Translate one export row (dict keyed by Spanish header) into importer keys."""
    day, month, year = split_birth_date(source.get("Fecha de nacimiento", ""))
    amount = money(source.get("Monto pagado", ""))
    paid = amount not in ("", "0.00")

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
        # The importer needs BOTH montopago and fechapago, so a paid walker with no
        # date would import owing the full fee — and get charged again at
        # reception. See registration_date_iso() for why the registration date is
        # good enough here. Only emitted when money actually came in: a zero
        # amount must not create a payment record.
        "montopago": amount,
        "fechapago": registration_date_iso(source.get("Fecha de registro", "")) if paid else "",
        # "Activa" is the healthy state; anything else means the person is out.
        "cancelado": "N" if source.get("Estado de la inscripción", "").strip() == "Activa" else "S",
    })

    for label, column in SACRAMENTS.items():
        if label in source.get("Sacramentos", ""):
            out[column] = "S"

    # The folio is how the parish refers to this person and how their payment is
    # reconciled, so it must survive the trip. There is no column for it.
    notes = [f"Folio {source['Folio']}"] if source.get("Folio") else []
    # Su dirección real, cuando compartía correo y le dimos uno sintético.
    if source.get("__correo_original"):
        notes.append(f"Correo original: {source['__correo_original']}")
    # No destination in Participant: the model has medication and dietary fields
    # but nothing for a general health condition, so it rides along in the notes.
    if yes_no(source.get("¿Tiene condición médica?", "")) == "S":
        detail = source.get("Condición médica (detalle)", "").strip()
        notes.append(f"CONDICIÓN MÉDICA: {detail}" if detail else "TIENE CONDICIÓN MÉDICA (sin detalle)")
    if source.get("Forma de pago"):
        notes.append(f"Forma de pago: {source['Forma de pago']}")
    if source.get("Estado del pago"):
        estado = source["Estado del pago"]
        # "Último pago (estado)" es lo único que distingue un pago RECHAZADO de
        # uno que nunca se intentó: ambos dejan "Estado del pago: Pendiente".
        ultimo = source.get("Último pago (estado)", "").strip()
        saldo = source.get("Saldo pendiente", "").strip()
        detalle = f"Pago: {estado}"
        if ultimo and ultimo.lower() != "confirmado":
            detalle += f" (último intento: {ultimo})"
        if saldo:
            detalle += f", saldo {saldo}"
        notes.append(detalle)
    out["notas"] = " | ".join(notes)

    return {key: sanitize_for_csv(value) for key, value in out.items()}


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

    resolved_emails = resolve_shared_emails(records)
    converted = [convert_row(record) for record in records]

    # utf-8-sig: without the BOM, Excel opens the file mangling every accent.
    with open(output_path, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(converted)

    print(f"✓ {len(converted)} registros -> {output_path}")
    if padding:
        print(f"  ({padding} filas vacías del export descartadas)")

    # Dos filas con el mismo correo NO son dos personas para el importador: hace
    # upsert por email, así que la segunda pisa a la primera y una desaparece.
    # Pasa de verdad — familias que comparten una dirección. Y en el retiro de
    # Veracruz de 2026-09 una sola dirección la compartían 15 personas.
    # Además, la fila siguiente a una que actualiza ha fallado con
    # "cannot start a transaction within a transaction" en importaciones grandes.
    if resolved_emails:
        print("\n📧 CORREOS COMPARTIDOS RESUELTOS (el importador los habría fundido en una persona):")
        for folio, first_folio, synthetic in resolved_emails:
            print(f"    {folio} compartía correo con {first_folio} -> {synthetic}")
        print("    Su dirección real queda en `notas`. Si dos filas son LA MISMA persona,")
        print("    se dejan con el correo compartido a propósito: así se reconcilian.")

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
