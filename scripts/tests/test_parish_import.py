"""Tests for the parish walker import scripts (troubleshooting §25.8).

    python3 -m unittest scripts/tests/test_parish_import.py

Standard library only, like the scripts themselves. Fixture data is invented.
"""

import contextlib
import csv
import importlib.util
import io
import os
import sqlite3
import tempfile
import unittest

SCRIPTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def load(filename, name):
    # The script filenames have hyphens, so they cannot be imported by name.
    spec = importlib.util.spec_from_file_location(name, os.path.join(SCRIPTS, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


convert = load("convert-parish-registrations.py", "convert_parish_registrations")
check = load("check-import.py", "check_import")

BORROWED = "angelito@example.test"
REAL = "invitado@example.test"


def write_corrections(rows):
    handle = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="", encoding="utf-8")
    writer = csv.DictWriter(handle, fieldnames=["folio", "correo_del_registro", "correo_real", "nota"])
    writer.writeheader()
    writer.writerows(rows)
    handle.close()
    return handle.name


class ApplyEmailCorrectionsTest(unittest.TestCase):
    def setUp(self):
        self.path = write_corrections([
            {"folio": "EH-0001", "correo_del_registro": BORROWED, "correo_real": REAL,
             "nota": "el de su hermano"},
        ])

    def tearDown(self):
        os.unlink(self.path)

    def test_swaps_the_borrowed_email_and_keeps_it_in_notas(self):
        records = [{"Folio": "EH-0001", "Correo": "Angelito@Example.test", "Nombre": "Beto"}]
        applied, stale = convert.apply_email_corrections(records, self.path)

        self.assertEqual(records[0]["Correo"], REAL)
        self.assertEqual(applied, [("EH-0001", "Angelito@Example.test", REAL)])
        self.assertEqual(stale, [])
        notas = convert.convert_row(records[0])["notas"]
        self.assertIn("Correo original: Angelito@Example.test (el de su hermano)", notas)

    def test_does_not_apply_once_the_export_carries_another_email(self):
        # The parish fixed it, or the folio now holds someone else: applying the
        # correction blindly could move a row onto the wrong person.
        records = [{"Folio": "EH-0001", "Correo": "otro@example.test"}]
        applied, stale = convert.apply_email_corrections(records, self.path)

        self.assertEqual(records[0]["Correo"], "otro@example.test")
        self.assertEqual(applied, [])
        self.assertEqual(stale, [("EH-0001", "otro@example.test", BORROWED)])

    def test_leaves_other_folios_alone(self):
        records = [{"Folio": "EH-0002", "Correo": BORROWED}]
        applied, stale = convert.apply_email_corrections(records, self.path)

        self.assertEqual(records[0]["Correo"], BORROWED)
        self.assertEqual((applied, stale), ([], []))

    def test_missing_file_is_a_no_op(self):
        records = [{"Folio": "EH-0001", "Correo": BORROWED}]
        applied, stale = convert.apply_email_corrections(records, self.path + ".missing")

        self.assertEqual(records[0]["Correo"], BORROWED)
        self.assertEqual((applied, stale), ([], []))


RETREAT = "retreat-1"


def make_db():
    """The handful of columns check-import.py reads, with one angelito who lent
    their email and the walker already enrolled under their real one."""
    db = sqlite3.connect(":memory:")
    db.executescript("""
        CREATE TABLE retreat (id TEXT, parish TEXT, isPublic INTEGER, endDate TEXT);
        CREATE TABLE retreat_shirt_type (retreatId TEXT, availableSizes TEXT);
        CREATE TABLE participants (id TEXT, firstName TEXT, lastName TEXT, email TEXT, dataDeletedAt TEXT);
        CREATE TABLE retreat_participants (participantId TEXT, retreatId TEXT, type TEXT, isCancelled INTEGER);
    """)
    db.execute("INSERT INTO retreat VALUES (?, 'Parroquia', 1, '2030-01-01')", (RETREAT,))
    db.execute("INSERT INTO retreat_shirt_type VALUES (?, '[\"M\",\"G\"]')", (RETREAT,))
    db.executemany("INSERT INTO participants VALUES (?, ?, ?, ?, NULL)", [
        ("p-angelito", "Lalo", "Gomez", BORROWED),
        ("p-walker", "Beto", "Gomez", REAL),
    ])
    db.executemany("INSERT INTO retreat_participants VALUES (?, ?, ?, 0)", [
        ("p-angelito", RETREAT, "partial_server"),
        ("p-walker", RETREAT, "walker"),
    ])
    return db


def csv_row(nombre, email, folio="EH-0001"):
    return {"nombre": nombre, "apellidos": "Gomez", "email": email, "camiseta": "M",
            "notas": f"Folio {folio} | Forma de pago: Transferencia"}


def quiet(fn, *args):
    with contextlib.redirect_stdout(io.StringIO()) as out:
        result = fn(*args)
    return result, out.getvalue()


class CheckImportBorrowedEmailTest(unittest.TestCase):
    def test_before_blocks_an_unresolved_borrowed_email(self):
        db = make_db()
        db.execute("DELETE FROM retreat_participants WHERE participantId = 'p-walker'")
        problems, _ = quiet(check.check_before, db, [csv_row("Beto", BORROWED)], RETREAT)

        self.assertEqual(len(problems), 1)
        self.assertIn("partial_server", problems[0])
        self.assertIn(check.CORRECTIONS_HINT, problems[0])

    def test_before_only_warns_when_the_walker_is_already_enrolled(self):
        problems, out = quiet(check.check_before, make_db(), [csv_row("Beto", BORROWED)], RETREAT)

        self.assertEqual(problems, [])
        self.assertIn(f"ya está como caminante con {REAL}", out)
        self.assertIn(check.CORRECTIONS_HINT, out)

    def test_after_accepts_the_walker_enrolled_under_the_real_email(self):
        problems, out = quiet(check.check_after, make_db(), [csv_row("Beto", BORROWED)], RETREAT)

        self.assertEqual(problems, [])
        self.assertIn("correo prestado", out)

    def test_after_reports_the_row_when_no_walker_has_that_name(self):
        db = make_db()
        db.execute("DELETE FROM retreat_participants WHERE participantId = 'p-walker'")
        problems, out = quiet(check.check_after, db, [csv_row("Beto", BORROWED)], RETREAT)

        self.assertEqual(len(problems), 1)
        self.assertIn("fila saltada", out)

    def test_a_cancelled_walker_with_that_name_does_not_count(self):
        db = make_db()
        db.execute("UPDATE retreat_participants SET isCancelled = 1 WHERE participantId = 'p-walker'")
        problems, _ = quiet(check.check_after, db, [csv_row("Beto", BORROWED)], RETREAT)

        self.assertEqual(len(problems), 1)

    def test_after_passes_the_corrected_row(self):
        problems, _ = quiet(check.check_after, make_db(), [csv_row("Beto", REAL)], RETREAT)

        self.assertEqual(problems, [])


if __name__ == "__main__":
    unittest.main()
