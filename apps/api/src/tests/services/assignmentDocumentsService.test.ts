/**
 * assignmentDocumentsService (specs/assignment-documents D2-D4, R6, R7): who
 * receives each moment and which documents travel with it.
 */
import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Responsability, ResponsabilityType } from '@/entities/responsability.entity';
import { ScheduleTemplate } from '@/entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '@/entities/scheduleTemplateSet.entity';
import { RetreatScheduleItem } from '@/entities/retreatScheduleItem.entity';
import { RetreatScheduleItemResponsable } from '@/entities/retreatScheduleItemResponsable.entity';
import { ResponsabilityAttachment } from '@/entities/responsabilityAttachment.entity';
import { TableMesa } from '@/entities/tableMesa.entity';
import { AssignmentDocumentsService } from '@/services/assignmentDocumentsService';
import { v4 as uuidv4 } from 'uuid';

describe('AssignmentDocumentsService.forRetreat', () => {
	const getDS = () => TestDataFactory['testDataSource'];
	let service: AssignmentDocumentsService;
	let retreatId: string;
	const ids: Record<string, string> = {};

	beforeAll(async () => {
		await setupTestDatabase();
		service = new AssignmentDocumentsService();
		const ds = getDS();

		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		retreatId = retreat.id;

		const person = async (key: string, overrides: Record<string, unknown>) => {
			const p = await TestDataFactory.createTestParticipant(retreatId, {
				firstName: key,
				email: `${key}-${uuidv4()}@example.com`,
				...overrides,
			} as any);
			ids[key] = p.id;
		};
		await person('alice', { type: 'server' });
		await person('bob', { type: 'server' });
		await person('carol', { type: 'server', isCancelled: true });
		await person('dave', { type: 'partial_server' });
		await person('walker', { type: 'walker' });

		await ds.getRepository(TableMesa).save([
			{ name: 'Mesa 1', retreatId, liderId: ids.alice, colider1Id: ids.bob },
			{ name: 'Mesa 2', retreatId, liderId: ids.carol },
		] as Partial<TableMesa>[]);

		const set = await ds
			.getRepository(ScheduleTemplateSet)
			.save({ id: uuidv4(), name: 'Assignment Docs Set', isActive: true, isDefault: false });
		const tplRepo = ds.getRepository(ScheduleTemplate);
		const [wallTpl, prayerTpl] = await tplRepo.save([
			tplRepo.create({
				templateSetId: set.id,
				name: 'Dinámica La Pared',
				responsabilityName: 'Texto: Dinámica de la Pared',
			}),
			tplRepo.create({
				templateSetId: set.id,
				name: 'Dinámica: Oración en Grupo',
				responsabilityName: 'Oración de Intercesión',
				documentName: 'Texto: Dinámicas de Oración en Grupo',
				documentAudience: 'table_leaders',
			}),
		]);

		const respRepo = ds.getRepository(Responsability);
		const [prayerResp] = await respRepo.save([
			{
				retreatId,
				name: 'Oración de Intercesión',
				responsabilityType: ResponsabilityType.ORACION,
				participantId: ids.bob,
			},
			{
				retreatId,
				// Trailing space on purpose: the attachments are keyed by the trimmed name.
				name: 'Reglamento de la Casa ',
				responsabilityType: ResponsabilityType.OTRO,
				participantId: ids.dave,
			},
		] as Partial<Responsability>[]);

		const itemRepo = ds.getRepository(RetreatScheduleItem);
		const [wallItem] = await itemRepo.save([
			// Sábado 20:15 en CDMX (UTC-6).
			itemRepo.create({
				retreatId,
				scheduleTemplateId: wallTpl.id,
				name: 'Dinámica La Pared',
				day: 2,
				startTime: new Date('2026-10-18T02:15:00.000Z'),
				endTime: new Date('2026-10-18T02:40:00.000Z'),
			}),
			// Sábado 14:40 en CDMX.
			itemRepo.create({
				retreatId,
				scheduleTemplateId: prayerTpl.id,
				responsabilityId: prayerResp.id,
				name: 'Dinámica: Oración en Grupo',
				day: 2,
				startTime: new Date('2026-10-17T20:40:00.000Z'),
				endTime: new Date('2026-10-17T21:40:00.000Z'),
			}),
		]);
		await ds.getRepository(RetreatScheduleItemResponsable).save([
			{ scheduleItemId: wallItem.id, participantId: ids.alice },
			// A walker listed as responsable never receives documents (R6).
			{ scheduleItemId: wallItem.id, participantId: ids.walker },
		] as Partial<RetreatScheduleItemResponsable>[]);

		const attRepo = ds.getRepository(ResponsabilityAttachment);
		const file = (responsabilityName: string, fileName: string, storageUrl: string, description?: string) =>
			attRepo.create({
				responsabilityName,
				kind: 'file',
				fileName,
				mimeType: 'application/pdf',
				sizeBytes: 10,
				storageUrl,
				description: description ?? null,
			});
		await attRepo.save([
			file('Texto: Dinámica de la Pared', 'pared.pdf', 'https://bucket/pared.pdf', 'Secuencia de la Pared'),
			file('Texto: Dinámica de la Pared', 'inline.pdf', 'data:application/pdf;base64,AAAA'),
			attRepo.create({
				responsabilityName: 'Texto: Dinámica de la Pared',
				kind: 'markdown',
				fileName: 'Guion.md',
				mimeType: 'text/markdown',
				sizeBytes: 10,
				storageUrl: 'data:text/markdown;base64,AAAA',
				content: '# Guion',
			}),
			file('Texto: Dinámicas de Oración en Grupo', '07 Dinamica 1.pdf', 'https://bucket/d1.pdf'),
			file('Oración de Intercesión', 'intercesion.pdf', 'https://bucket/intercesion.pdf'),
			file('Reglamento de la Casa', 'reglas.pdf', 'https://bucket/reglas.pdf', 'Reglas para el retiro'),
		]);
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	it('gives a responsable the moment, its link-only documents, and day/time in the retreat zone', async () => {
		const alice = (await service.forRetreat(retreatId)).get(ids.alice)!;
		const wall = alice.moments.find((m) => m.name === 'Dinámica La Pared')!;
		expect(wall).toMatchObject({ dayLabel: 'Sábado', time: '20:15' });
		expect(wall.forTable).toBeUndefined();
		// The markdown and the inline (data:) file have no shareable link.
		expect(wall.documents).toEqual([{ label: 'Secuencia de la Pared', url: 'https://bucket/pared.pdf' }]);
	});

	it('sends the table dynamics to every active table leader, chronologically, with their table', async () => {
		const alice = (await service.forRetreat(retreatId)).get(ids.alice)!;
		expect(alice.moments.map((m) => m.name)).toEqual(['Dinámica: Oración en Grupo', 'Dinámica La Pared']);
		const prayer = alice.moments[0];
		expect(prayer).toMatchObject({ dayLabel: 'Sábado', time: '14:40', forTable: true });
		expect(prayer.documents).toEqual([{ label: '07 Dinamica 1', url: 'https://bucket/d1.pdf' }]);
		expect(alice.table).toEqual({ name: 'Mesa 1', role: 'líder' });
	});

	it('a table leader who is also the moment responsable gets it once, not as a table moment', async () => {
		const bob = (await service.forRetreat(retreatId)).get(ids.bob)!;
		expect(bob.moments).toHaveLength(1);
		expect(bob.moments[0].forTable).toBeUndefined();
		expect(bob.moments[0].documents.map((d) => d.url)).toEqual(['https://bucket/d1.pdf']);
		// His responsibility's own document does not travel through the moment.
		expect(bob.responsibilityDocuments).toEqual([
			{ name: 'Oración de Intercesión', documents: [{ label: 'intercesion', url: 'https://bucket/intercesion.pdf' }] },
		]);
	});

	it('lists the documents of a responsibility without a moment', async () => {
		const dave = (await service.forRetreat(retreatId)).get(ids.dave)!;
		expect(dave.moments).toEqual([]);
		expect(dave.responsibilityDocuments).toEqual([
			{
				name: 'Reglamento de la Casa',
				documents: [{ label: 'Reglas para el retiro', url: 'https://bucket/reglas.pdf' }],
			},
		]);
	});

	it('forParticipant builds the retreat once for a run of recipients', async () => {
		const fresh = new AssignmentDocumentsService();
		const spy = jest.spyOn(fresh, 'forRetreat');
		const [alice, bob] = await Promise.all([
			fresh.forParticipant(retreatId, ids.alice),
			fresh.forParticipant(retreatId, ids.bob),
		]);
		await fresh.forParticipant(retreatId, ids.dave);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(alice.moments.length).toBeGreaterThan(0);
		expect(bob.moments.length).toBeGreaterThan(0);
		spy.mockRestore();
	});

	it('leaves out cancelled servers and walkers (R6)', async () => {
		const map = await service.forRetreat(retreatId);
		expect(map.has(ids.carol)).toBe(false);
		expect(map.has(ids.walker)).toBe(false);
		expect(await service.forParticipant(retreatId, ids.walker)).toEqual({
			moments: [],
			responsibilityDocuments: [],
			table: null,
		});
	});
});
