import { describe, it, expect } from 'vitest';
import { buildGoogleContactsCsv } from '../googleContactsExport';

/**
 * Formato validado a mano con Google Contacts el 2026-10-20 (retiro Buen
 * Despacho): columnas fijas, identificador en Name Y Family Name (Google
 * reconstruye el nombre visible desde Given+Family al importar), E.164 en el
 * teléfono, BOM + CRLF como los export del propio Google.
 */
describe('buildGoogleContactsCsv', () => {
	it('encabezado exacto, BOM al inicio y CRLF de separador', () => {
		const csv = buildGoogleContactsCsv(
			[{ firstName: 'Juan', lastName: 'Pérez', cellPhone: '5549442834', country: 'México' }],
			'Emaus ValleII',
		);
		expect(csv.charCodeAt(0)).toBe(0xfeff);
		expect(csv).toContain('\r\n');
		expect(csv.split('\r\n')[0].slice(1)).toBe(
			'Name,Given Name,Family Name,Phone 1 - Type,Phone 1 - Value,Group Membership',
		);
	});

	it('el identificador va en Name y Family Name; Given Name queda limpio', () => {
		const csv = buildGoogleContactsCsv(
			[{ firstName: 'Juan', lastName: 'Pérez', cellPhone: '5549442834' }],
			'Emaus ValleII',
		);
		const row = csv.split('\r\n')[1];
		expect(row).toBe(
			'"Juan Pérez Emaus ValleII","Juan","Pérez Emaus ValleII","Mobile","+525549442834","Emaus ValleII ::: * myContacts"',
		);
	});

	it('normaliza el teléfono a E.164: nacional, ya-con-lada y legacy 521', () => {
		const csv = buildGoogleContactsCsv(
			[
				{ firstName: 'A', lastName: 'A', cellPhone: '5549442834', country: 'MX' },
				{ firstName: 'B', lastName: 'B', cellPhone: '+52 55 4944 2834', country: 'MX' },
				{ firstName: 'C', lastName: 'C', cellPhone: '5215549442834', country: 'MX' },
				{ firstName: 'D', lastName: 'D', cellPhone: '3001234567', country: 'Colombia' },
			],
			'Test',
		);
		const rows = csv.split('\r\n').slice(1, 5);
		expect(rows[0]).toContain('"+525549442834"');
		expect(rows[1]).toContain('"+525549442834"');
		expect(rows[2]).toContain('"+525549442834"');
		expect(rows[3]).toContain('"+573001234567"');
	});

	it('escapa comillas dobles dentro de un nombre sin romper el conteo de columnas', () => {
		const csv = buildGoogleContactsCsv(
			[{ firstName: 'José "Pepe"', lastName: 'O\'Brien', cellPhone: '5549442834' }],
			'Test',
		);
		const row = csv.split('\r\n')[1];
		expect(row.startsWith('"José ""Pepe"" O\'Brien Test"')).toBe(true);
		// 6 columnas exactas aunque el nombre traiga comillas escapadas.
		expect(row.split('","').length - 1).toBe(5);
	});

	it('participante sin celular exporta la fila con el teléfono vacío', () => {
		const csv = buildGoogleContactsCsv(
			[{ firstName: 'Juan', lastName: 'Pérez', cellPhone: '' }],
			'Test',
		);
		const row = csv.split('\r\n')[1];
		expect(row).toBe('"Juan Pérez Test","Juan","Pérez Test","Mobile","","Test ::: * myContacts"');
	});

	it('identificador vacío lanza (el modal lo valida antes de emitir)', () => {
		expect(() => buildGoogleContactsCsv([{ firstName: 'A', lastName: 'A' }], '  ')).toThrow();
	});

	it('apellido vacío no deja un doble espacio: el identificador es el Family Name', () => {
		const csv = buildGoogleContactsCsv([{ firstName: 'Juan', lastName: '' }], 'Test');
		const row = csv.split('\r\n')[1];
		expect(row.startsWith('"Juan Test","Juan","Test"')).toBe(true);
	});
});
