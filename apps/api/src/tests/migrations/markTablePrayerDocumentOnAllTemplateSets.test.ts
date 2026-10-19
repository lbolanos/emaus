/**
 * MarkTablePrayerDocumentOnAllTemplateSets20261019140000: a set cloned from the
 * seeded one (the seeder never syncs it) gets the table dynamics' document and
 * audience; a customised row and unrelated rows are left alone.
 */
import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { ScheduleTemplate } from '@/entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '@/entities/scheduleTemplateSet.entity';
import { MarkTablePrayerDocumentOnAllTemplateSets20261019140000 as Migration } from '@/migrations/sqlite/20261019140000_MarkTablePrayerDocumentOnAllTemplateSets';
import { v4 as uuidv4 } from 'uuid';

describe('MarkTablePrayerDocumentOnAllTemplateSets20261019140000', () => {
	const getDS = () => TestDataFactory['testDataSource'];

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	it('marks the table dynamics of a cloned set, leaving customised and unrelated rows', async () => {
		const ds = getDS();
		const clone = await ds
			.getRepository(ScheduleTemplateSet)
			.save({ id: uuidv4(), name: 'Emaús — Del Valle', sourceTag: 'clon:emaus_mexico', isActive: true, isDefault: false });
		const repo = ds.getRepository(ScheduleTemplate);
		const [prayer, sharing, customised, unrelated] = await repo.save([
			repo.create({
				templateSetId: clone.id,
				name: 'Dinámica: Oración en Grupo (Mateo 18:19-20)',
				responsabilityName: 'Oración de Intercesión',
			}),
			repo.create({
				templateSetId: clone.id,
				name: 'Dinámica: Oración Compartida (líder bendice con Números 6:24-26)',
				responsabilityName: 'Oración de Intercesión',
			}),
			// The community re-pointed this one: keep it.
			repo.create({
				templateSetId: clone.id,
				name: 'Dinámica Oración Compartida',
				responsabilityName: 'Oración de Intercesión',
				documentName: 'Texto: Otra dinámica',
			}),
			repo.create({ templateSetId: clone.id, name: 'Dinámica La Pared', responsabilityName: 'Texto: Dinámica de la Pared' }),
		]);

		const qr = ds.createQueryRunner();
		try {
			const migration = new Migration();
			await migration.up(qr);
			await migration.up(qr); // idempotent

			const byId = async (id: string) => repo.findOneByOrFail({ id });
			for (const row of [prayer, sharing]) {
				const after = await byId(row.id);
				expect(after.documentName).toBe(Migration.DOCUMENT_NAME);
				expect(after.documentAudience).toBe('table_leaders');
				expect(after.responsabilityName).toBe('Oración de Intercesión');
			}
			expect((await byId(customised.id)).documentName).toBe('Texto: Otra dinámica');
			expect((await byId(unrelated.id)).documentAudience).toBe('responsables');

			await migration.down(qr);
			const reverted = await byId(prayer.id);
			expect(reverted.documentName).toBeNull();
			expect(reverted.documentAudience).toBe('responsables');
			expect((await byId(customised.id)).documentName).toBe('Texto: Otra dinámica');
		} finally {
			await qr.release();
		}
	});
});
