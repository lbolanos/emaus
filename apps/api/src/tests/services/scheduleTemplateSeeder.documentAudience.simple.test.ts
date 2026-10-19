/**
 * D3 of specs/assignment-documents: only the table prayer dynamics carry a
 * document of their own, sent to every table leader. They keep their
 * responsibility (Oración de Intercesión) so the person in charge stays linked,
 * and the seeder's field sync writes the values to existing template rows.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { AppDataSource } from '@/data-source';
import { ScheduleTemplate } from '@/entities/scheduleTemplate.entity';
import { __TEST__, createDefaultScheduleTemplate } from '../../data/scheduleTemplateSeeder';

const TABLE_PRAYER_NAMES = [
	'Dinámica de Oración de Intercesión',
	'Dinámica Oración Compartida',
	'Dinámica: Oración en Grupo (Mateo 18:19-20)',
	'Dinámica: Oración Compartida (líder bendice con Números 6:24-26)',
];
const TABLE_PRAYER_DOC = 'Texto: Dinámicas de Oración en Grupo';

describe('scheduleTemplateSeeder — document of the table prayer dynamics', () => {
	const allRows = [...__TEST__.STA_CLARA_ITEMS, ...__TEST__.POLANCO_ITEMS];

	it('only the four table prayer dynamics have a document and the table audience', () => {
		const withDocument = allRows.filter((r) => r.documentName != null);
		expect(withDocument.map((r) => r.name).sort()).toEqual([...TABLE_PRAYER_NAMES].sort());
		for (const row of withDocument) {
			expect(row.documentName).toBe(TABLE_PRAYER_DOC);
			expect(row.documentAudience).toBe('table_leaders');
		}
		const tableAudience = allRows.filter((r) => r.documentAudience === 'table_leaders');
		expect(tableAudience).toHaveLength(4);
	});

	it('the table prayer dynamics keep their responsibility', () => {
		for (const name of TABLE_PRAYER_NAMES) {
			const row = allRows.find((r) => r.name === name);
			expect(row?.responsabilityName).toBe('Oración de Intercesión');
		}
	});

	describe('field sync on boot', () => {
		beforeAll(async () => {
			await setupTestDatabase();
		});
		afterAll(async () => {
			await teardownTestDatabase();
		});

		it('writes the values to the template rows and restores them when they drift', async () => {
			const repo = AppDataSource.getRepository(ScheduleTemplate);
			await createDefaultScheduleTemplate();

			const tableRows = await repo.find({ where: { documentAudience: 'table_leaders' } });
			expect(tableRows.map((r) => r.name).sort()).toEqual([...TABLE_PRAYER_NAMES].sort());
			expect(tableRows.every((r) => r.documentName === TABLE_PRAYER_DOC)).toBe(true);

			// Every other row keeps the default audience and no document.
			const others = await repo.find({ where: { documentAudience: 'responsables' } });
			expect(others.length).toBeGreaterThan(0);
			expect(others.every((r) => r.documentName == null)).toBe(true);

			// A drifted row is put back by the next boot's sync.
			await repo.update(tableRows[0].id, { documentAudience: 'responsables', documentName: null });
			await createDefaultScheduleTemplate();
			const restored = await repo.findOneByOrFail({ id: tableRows[0].id });
			expect(restored.documentAudience).toBe('table_leaders');
			expect(restored.documentName).toBe(TABLE_PRAYER_DOC);
		});
	});
});
