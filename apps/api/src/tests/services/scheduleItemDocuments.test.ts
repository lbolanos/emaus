/**
 * D1/D4 of specs/assignment-documents: a schedule moment's document comes from
 * the template's own `documentName`, then from its retreat responsibility, and
 * finally from the template's `responsabilityName` when the retreat has no
 * responsibility with that name (materialization leaves the moment unlinked,
 * so before this the schedule showed no document for e.g. "Dinámica La Pared").
 */
import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Responsability, ResponsabilityType } from '@/entities/responsability.entity';
import { ScheduleTemplate } from '@/entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '@/entities/scheduleTemplateSet.entity';
import { RetreatScheduleItem } from '@/entities/retreatScheduleItem.entity';
import { ResponsabilityAttachment } from '@/entities/responsabilityAttachment.entity';
import { RetreatScheduleService } from '@/services/retreatScheduleService';
import { responsabilityAttachmentService } from '@/services/responsabilityAttachmentService';
import { resolveScheduleItemDocumentName } from '@/utils/scheduleItemDocument';
import { v4 as uuidv4 } from 'uuid';

describe('resolveScheduleItemDocumentName', () => {
	it('prefers the template document, then the responsibility, then the template responsibility', () => {
		expect(
			resolveScheduleItemDocumentName('Oración de Intercesión', {
				documentName: 'Texto: Dinámicas de Oración en Grupo',
				responsabilityName: 'Oración de Intercesión',
			}),
		).toBe('Texto: Dinámicas de Oración en Grupo');
		expect(
			resolveScheduleItemDocumentName('Comedor', { documentName: null, responsabilityName: 'Comedor' }),
		).toBe('Comedor');
		expect(
			resolveScheduleItemDocumentName(null, {
				documentName: null,
				responsabilityName: 'Texto: Dinámica de la Pared',
			}),
		).toBe('Texto: Dinámica de la Pared');
	});

	it('returns null for a hand-made moment without responsibility, and ignores blanks', () => {
		expect(resolveScheduleItemDocumentName(null, null)).toBeNull();
		expect(resolveScheduleItemDocumentName('  ', { documentName: ' ', responsabilityName: '' })).toBeNull();
	});
});

describe('RetreatScheduleService.listForRetreat — document of each moment', () => {
	const getDS = () => TestDataFactory['testDataSource'];
	let service: RetreatScheduleService;
	let retreatId: string;

	beforeAll(async () => {
		await setupTestDatabase();
		// After the DB is up: the service binds its repositories on construction.
		service = new RetreatScheduleService();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	const file = (responsabilityName: string, fileName: string, storageUrl: string) =>
		getDS().getRepository(ResponsabilityAttachment).create({
			responsabilityName,
			kind: 'file',
			fileName,
			mimeType: 'application/pdf',
			sizeBytes: 10,
			storageUrl,
		});

	beforeEach(async () => {
		const ds = getDS();
		await ds.getRepository(RetreatScheduleItem).clear();
		await ds.getRepository(ScheduleTemplate).clear();
		await ds.getRepository(ScheduleTemplateSet).clear();
		await ds.getRepository(ResponsabilityAttachment).clear();

		const retreat = await TestDataFactory.createTestRetreat();
		retreatId = retreat.id;

		const set = await ds
			.getRepository(ScheduleTemplateSet)
			.save({ id: uuidv4(), name: 'Docs Set', isActive: true, isDefault: false });
		const tplRepo = ds.getRepository(ScheduleTemplate);
		const [wallTpl, prayerTpl] = await tplRepo.save([
			tplRepo.create({
				templateSetId: set.id,
				name: 'Dinámica La Pared',
				type: 'dinamica',
				responsabilityName: 'Texto: Dinámica de la Pared',
			}),
			tplRepo.create({
				templateSetId: set.id,
				name: 'Dinámica: Oración en Grupo',
				type: 'dinamica',
				responsabilityName: 'Oración de Intercesión',
				documentName: 'Texto: Dinámicas de Oración en Grupo',
				documentAudience: 'table_leaders',
			}),
		]);

		const prayer = await ds.getRepository(Responsability).save({
			retreatId,
			name: 'Oración de Intercesión',
			responsabilityType: ResponsabilityType.ORACION,
		} as Partial<Responsability>);

		const at = (hour: number) => new Date(Date.UTC(2026, 9, 17, hour));
		const itemRepo = ds.getRepository(RetreatScheduleItem);
		await itemRepo.save([
			// Unlinked: the retreat has no "Texto: Dinámica de la Pared" responsibility.
			itemRepo.create({
				retreatId,
				scheduleTemplateId: wallTpl.id,
				name: 'Dinámica La Pared',
				day: 2,
				startTime: at(20),
				endTime: at(21),
			}),
			// Linked to its responsibility, but the template names its own document.
			itemRepo.create({
				retreatId,
				scheduleTemplateId: prayerTpl.id,
				responsabilityId: prayer.id,
				name: 'Dinámica: Oración en Grupo',
				day: 2,
				startTime: at(14),
				endTime: at(15),
			}),
			// Hand-made moment: no template, no responsibility.
			itemRepo.create({ retreatId, name: 'Testimonio 1', day: 2, startTime: at(11), endTime: at(12) }),
		]);

		await ds
			.getRepository(ResponsabilityAttachment)
			.save([
				file('Texto: Dinámica de la Pared', 'pared.pdf', 'https://bucket/pared.pdf'),
				file('Texto: Dinámicas de Oración en Grupo', 'dinamica1.pdf', 'https://bucket/d1.pdf'),
				file('Oración de Intercesión', 'intercesion.pdf', 'https://bucket/intercesion.pdf'),
			]);
	});

	it('exposes documentName and its attachments, falling back to the template', async () => {
		const items = (await service.listForRetreat(retreatId)) as any[];
		const byName = Object.fromEntries(items.map((i) => [i.name, i]));

		expect(byName['Dinámica La Pared'].documentName).toBe('Texto: Dinámica de la Pared');
		expect(byName['Dinámica La Pared'].attachments.map((a: any) => a.fileName)).toEqual(['pared.pdf']);

		// The template's own document wins over the responsibility's.
		expect(byName['Dinámica: Oración en Grupo'].documentName).toBe(
			'Texto: Dinámicas de Oración en Grupo',
		);
		expect(byName['Dinámica: Oración en Grupo'].attachments.map((a: any) => a.fileName)).toEqual([
			'dinamica1.pdf',
		]);

		expect(byName['Testimonio 1'].documentName).toBeNull();
		expect(byName['Testimonio 1'].attachments).toEqual([]);
	});

	it('listShareableFilesForNames keeps only files with an http(s) link', async () => {
		const repo = getDS().getRepository(ResponsabilityAttachment);
		await repo.save([
			file('Texto: Dinámica de la Pared', 'inline.pdf', 'data:application/pdf;base64,AAAA'),
			repo.create({
				responsabilityName: 'Texto: Dinámica de la Pared',
				kind: 'markdown',
				fileName: 'Guion.md',
				mimeType: 'text/markdown',
				sizeBytes: 10,
				storageUrl: 'data:text/markdown;base64,AAAA',
				content: '# Guion',
			}),
		]);

		const map = await responsabilityAttachmentService.listShareableFilesForNames([
			'Texto: Dinámica de la Pared',
			'Sin documentos',
		]);
		const wall = map.get('Texto: Dinámica de la Pared') ?? [];
		expect(wall.map((a) => a.fileName)).toEqual(['pared.pdf']);
		expect(wall[0].storageUrl).toBe('https://bucket/pared.pdf');
		expect(map.has('Sin documentos')).toBe(false);
	});
});
