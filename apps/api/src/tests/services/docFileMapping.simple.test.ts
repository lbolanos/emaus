// Tests for document file mappings in apps/web/public/docs/dinamicas/
// Validates all referenced files exist on disk and no orphan files

import * as fs from 'fs';
import * as path from 'path';

const DOCS_DIR = path.resolve(__dirname, '../../../../web/public/docs/dinamicas');

// Expected files in the dinamicas directory (from responsibility and service team mappings)
const expectedFiles = [
	'03 Guardia Santísimo.xlsx',
	'03 Sobre la Confidencialidad.pdf',
	'04 La Rosa.pdf',
	'05.B Diario.pdf',
	'05 Palancas.pdf',
	'07 Dinamica 1 Oracion Peticion v2.pdf',
	'08 Dinamica Sanacion De Recuerdos Hombres.pdf',
	'09 Explicacion de la Hoja de Pecados.pdf',
	'09 Explicacion de la Hoja de Pecados (Una Nueva Voz Despues de Sanacion de Recuerdos).pdf',
	'10 Confesiones Instrucciones a Sacerdotes.pdf',
	'10 Dinamicas Pared Lavado Palancas.pdf',
	'11 Carta a Jesús.pdf',
	'12 Dinamica 2 Oracion en grupo.pdf',
	'13 Dinamica del Perdon.pdf',
	'Dinámica de Oración de Intercesión. Sabado..docx',
	'Historia del Retitro de Emaus.pdf',
	'Instrucciones para lideres de mesa.pdf',
	'Introducción a la Dinámica de Sanación.docx',
	'Jesucristo Ha Resucitado v2015_1Cor15_12-20.pdf',
	'Letreros Dinamicas - Cenizas,Lavado,Bendicion.pdf',
	'REGLAS PARA EL RETIRO.pdf',
];

describe('Document File Mappings', () => {
	describe('Dinamicas directory', () => {
		test('dinamicas directory should exist', () => {
			expect(fs.existsSync(DOCS_DIR)).toBe(true);
		});

		test('should have exactly 21 files', () => {
			const files = fs.readdirSync(DOCS_DIR);
			expect(files).toHaveLength(21);
		});

		test.each(expectedFiles)('file "%s" should exist on disk', (filename) => {
			const filePath = path.join(DOCS_DIR, filename);
			expect(fs.existsSync(filePath)).toBe(true);
		});

		test('every file on disk should be in the expected list (no orphans)', () => {
			const filesOnDisk = fs.readdirSync(DOCS_DIR);
			const orphans = filesOnDisk.filter((f) => !expectedFiles.includes(f));
			expect(orphans).toEqual([]);
		});
	});

	describe('getDocFileUrl encoding logic', () => {
		// Simulates the URL encoding logic used in the frontend
		const getDocFileUrl = (filename: string): string => {
			return `/docs/dinamicas/${encodeURIComponent(filename)}`;
		};

		test('should encode spaces correctly', () => {
			const url = getDocFileUrl('04 La Rosa.pdf');
			expect(url).toContain('04%20La%20Rosa.pdf');
			expect(url).not.toContain(' ');
		});

		test('should encode accents correctly', () => {
			const url = getDocFileUrl('Dinámica de Oración de Intercesión. Sabado..docx');
			expect(url).toContain('Din%C3%A1mica');
			expect(url).toContain('Oraci%C3%B3n');
			expect(url).toContain('Intercesi%C3%B3n');
		});

		test('should handle parentheses in filenames', () => {
			const url = getDocFileUrl(
				'09 Explicacion de la Hoja de Pecados (Una Nueva Voz Despues de Sanacion de Recuerdos).pdf',
			);
			// encodeURIComponent preserves parentheses as they are valid URL chars
			expect(url).toContain('(Una');
			expect(url).toContain('Recuerdos)');
		});

		test('should encode special characters (ú, é)', () => {
			const url = getDocFileUrl('11 Carta a Jesús.pdf');
			expect(url).toContain('Jes%C3%BAs');
		});

		test('should handle commas in filenames', () => {
			const url = getDocFileUrl('Letreros Dinamicas - Cenizas,Lavado,Bendicion.pdf');
			expect(url).toContain('Cenizas%2CLavado%2CBendicion');
		});

		test('all expected files should produce valid encoded URLs', () => {
			for (const filename of expectedFiles) {
				const url = getDocFileUrl(filename);
				expect(url).toMatch(/^\/docs\/dinamicas\/.+$/);
				expect(url).not.toContain(' ');
			}
		});
	});
});
