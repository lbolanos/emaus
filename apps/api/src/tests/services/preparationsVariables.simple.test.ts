// Unit puro del scope {preparations.*} de @repo/utils: no toca DB. Cubre el
// formateo de la tabla del calendario y la resolución combinada con {retreat.*}
// que usan los documentos de preparación.

import {
	buildPreparationsTableMarkdown,
	replacePreparationsVariables,
	resolvePreparationDocumentContent,
	type PreparationEntryData,
} from '@repo/utils';

const session = (
	weekNumber: number,
	date: string,
	title = `${weekNumber}ª preparación`,
): PreparationEntryData => ({ type: 'session', weekNumber, title, date, time: '20:00' });

describe('scope {preparations.*}', () => {
	describe('buildPreparationsTableMarkdown', () => {
		it('arma una tabla GFM con una fila por entrada, en el orden recibido', () => {
			const table = buildPreparationsTableMarkdown([
				session(1, '2026-07-14'),
				session(2, '2026-07-21'),
			]);
			const lines = table.split('\n');
			expect(lines[0]).toBe('| # | Fecha | Preparación |');
			expect(lines[1]).toBe('| --- | --- | --- |');
			expect(lines).toHaveLength(4);
			expect(lines[2]).toContain('| 1 |');
			expect(lines[2]).toContain('14 de julio de 2026');
			expect(lines[2]).toContain('· 20:00');
		});

		it('marca los festivos sin número de semana y en su lugar cronológico', () => {
			const table = buildPreparationsTableMarkdown([
				session(1, '2026-07-14'),
				{ type: 'break', title: 'Semana Santa', date: '2026-07-21', weekNumber: null },
				session(2, '2026-07-28'),
			]);
			const rows = table.split('\n').slice(2);
			expect(rows[1]).toBe('| — | martes, 21 de julio de 2026 | _Semana Santa — sin reunión_ |');
			expect(rows[2]).toContain('| 2 |');
		});

		it('no rompe con sesiones sin fecha ni con títulos que traen pipes', () => {
			const table = buildPreparationsTableMarkdown([
				{ type: 'session', weekNumber: 1, title: 'Servicio | Humildad', date: null, time: null },
			]);
			expect(table).toContain('Por confirmar');
			expect(table).toContain('Servicio \\| Humildad');
			// La fila sigue teniendo exactamente 3 columnas.
			expect(table.split('\n')[2].split(/(?<!\\)\|/)).toHaveLength(5);
		});

		it('avisa en vez de imprimir una tabla vacía cuando no hay calendario', () => {
			expect(buildPreparationsTableMarkdown([])).toBe(
				'_El calendario de preparaciones aún no se ha generado._',
			);
		});
	});

	describe('replacePreparationsVariables', () => {
		it('sustituye table/count/firstDate/lastDate', () => {
			const out = replacePreparationsVariables(
				'{preparations.count} sesiones, de {preparations.firstDate} a {preparations.lastDate}',
				{ entries: [session(1, '2026-07-14'), session(2, '2026-07-21')] },
			);
			expect(out).toBe(
				'2 sesiones, de martes, 14 de julio de 2026 a martes, 21 de julio de 2026',
			);
		});

		it('deja intactos los placeholders desconocidos', () => {
			const out = replacePreparationsVariables('{preparations.count} y {otro.valor}', {
				entries: [session(1, '2026-07-14')],
			});
			expect(out).toBe('1 y {otro.valor}');
		});

		it('los festivos no cuentan como sesiones', () => {
			const out = replacePreparationsVariables('{preparations.count}', {
				entries: [
					session(1, '2026-07-14'),
					{ type: 'break', title: 'Festivo', date: '2026-07-21', weekNumber: null },
				],
			});
			expect(out).toBe('1');
		});
	});

	describe('resolvePreparationDocumentContent', () => {
		it('resuelve {retreat.*} y {preparations.*} en una sola pasada', () => {
			const out = resolvePreparationDocumentContent(
				'# {retreat.parish}\n\ncupo de {retreat.maxWalkers}\n\n{preparations.table}',
				{ parish: 'San Agustín', max_walkers: 30 },
				{ entries: [session(1, '2026-07-14')] },
			);
			expect(out).toContain('# San Agustín');
			expect(out).toContain('cupo de 30');
			expect(out).toContain('| # | Fecha | Preparación |');
			expect(out).not.toContain('{');
		});

		it('no inventa un calendario cuando no hay entradas', () => {
			const out = resolvePreparationDocumentContent(
				'{preparations.table}',
				{ parish: 'San Agustín' },
				{ entries: [] },
			);
			expect(out).toBe('_El calendario de preparaciones aún no se ha generado._');
		});
	});
});
