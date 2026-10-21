import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { Retreat } from '@/entities/retreat.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { Responsability } from '@/entities/responsability.entity';
import { TableMesa } from '@/entities/tableMesa.entity';
import { ServiceTeam } from '@/entities/serviceTeam.entity';
import { ServiceTeamMember } from '@/entities/serviceTeamMember.entity';
import { RetreatShirtType } from '@/entities/retreatShirtType.entity';
import { RetreatShirtTypeSizePrice } from '@/entities/retreatShirtTypeSizePrice.entity';
import { RetreatInventory } from '@/entities/retreatInventory.entity';
import { RetreatInventoryHistory } from '@/entities/retreatInventoryHistory.entity';
import { MessageTemplate } from '@/entities/messageTemplate.entity';
import { MessageSequence } from '@/entities/messageSequence.entity';
import { SequenceStep } from '@/entities/sequenceStep.entity';
import { RetreatScheduleItem } from '@/entities/retreatScheduleItem.entity';
import { RetreatPreRetreatTask } from '@/entities/retreatPreRetreatTask.entity';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import type { RetreatCloneSections } from '@repo/types';

/**
 * retreatCloneService — copying a previous retreat's setup into a freshly
 * created one, section by section.
 *
 * Invariants under test:
 * - Each selected section REPLACES the target's defaults (delete + copy).
 * - Nothing person-bound travels: no table leaders, no responsibility
 *   holders, no team leaders/members, no task assignees, no participants.
 * - Cross-section remaps: shirt inventory rows point at the NEW shirt type,
 *   sequence steps at the NEW template ids, schedule items at the target's
 *   own responsibilities (matched by name; unmatched → warning).
 * - Schedule items re-anchor to the target's startDate keeping the wall
 *   clock; pre-retreat tasks recompute dueDate from the effective offset.
 * - Guards: self-clone 400, missing retreat 404, participants enrolled 409.
 *
 * The service module is imported DYNAMICALLY after setupTestDatabase: it
 * binds module singletons (schedule/pre-task/sequence services) whose repos
 * capture AppDataSource.getRepository at construction, and the test setup
 * swaps that getter for the test database.
 */
describe('retreatCloneService.cloneFromRetreat', () => {
	const repo = <T>(entity: new () => T) => AppDataSource.getRepository<T>(entity as any);

	// Imported after setupTestDatabase (see comment above).
	let cloneFromRetreat: typeof import('@/services/retreatCloneService').cloneFromRetreat;

	// Retreat.startDate is a date-only column serialized in LOCAL time by the
	// sqlite driver: a `T00:00:00Z` instant lands on the previous calendar day
	// under America/Mexico_City. Local midnights keep the stored 'YYYY-MM-DD'
	// equal to the intended day regardless of the machine's TZ.
	const SOURCE_START = new Date(2026, 9, 2); // 2026-10-02
	const TARGET_START = new Date(2027, 2, 5); // 2027-03-05

	const ALL_SECTIONS: RetreatCloneSections = {
		tables: true,
		responsibilities: true,
		schedule: true,
		preRetreatTasks: true,
		inventory: true,
		shirtTypes: true,
		messageTemplates: true,
		messageSequences: true,
		serviceTeams: true,
	};

	const only = (...on: (keyof RetreatCloneSections)[]): RetreatCloneSections => ({
		...ALL_SECTIONS,
		...Object.fromEntries(
			(Object.keys(ALL_SECTIONS) as (keyof RetreatCloneSections)[]).map(
				(k) => [k, on.includes(k)],
			),
		),
	});

	beforeAll(async () => {
		await setupTestDatabase();
		({ cloneFromRetreat } = await import('@/services/retreatCloneService'));
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const makeRetreat = async (parish: string, startDate: Date) =>
		TestDataFactory.createTestRetreat({
			parish,
			startDate,
			endDate: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 2),
			timezone: 'UTC',
		});

	/** The audit log is fire-and-forget: wait for the clone row to land. */
	async function waitForCloneAudit(retreatId: string): Promise<DomainAuditLog | undefined> {
		const auditRepo = repo(DomainAuditLog);
		for (let i = 0; i < 60; i++) {
			const row = await auditRepo.findOne({
				where: { action: 'retreat.clone_from', resourceId: retreatId } as any,
			});
			if (row) return row;
			await new Promise((r) => setTimeout(r, 5));
		}
		return undefined;
	}

	it('replaces target defaults per section and copies structure without people', async () => {
		const source = await makeRetreat('Fuente', SOURCE_START);
		const target = await makeRetreat('Destino', TARGET_START);
		// Real participant rows: the test DB enforces FKs on lider/leader ids.
		// A Participant row alone does NOT enroll anyone (that lives in
		// retreat_participants), so the 409 guard stays untouched.
		const leader = await TestDataFactory.createTestParticipant(source.id);

		const respRepo = repo(Responsability);
		await respRepo.save(
			respRepo.create({
				retreatId: source.id,
				name: 'Sacerdotes',
				description: 'Acompañar las charlas',
				priority: 1,
			} as any),
		);
		const mesaRepo = repo(TableMesa);
		await mesaRepo.save(
			mesaRepo.create({ retreatId: source.id, name: 'Mesa 1', liderId: leader.id } as any),
		);
		await mesaRepo.save(mesaRepo.create({ retreatId: source.id, name: 'Mesa 2' } as any));
		const teamRepo = repo(ServiceTeam);
		await teamRepo.save(
			teamRepo.create({
				retreatId: source.id,
				name: 'Compras',
				teamType: 'compras',
				leaderId: leader.id,
			} as any),
		);

		// Target: "defaults" seeded by createRetreat that must disappear.
		await respRepo.save(respRepo.create({ retreatId: target.id, name: 'Default Resp' } as any));
		const oldTeam = await teamRepo.save(
			teamRepo.create({ retreatId: target.id, name: 'Default Team', teamType: 'otro' } as any),
		);
		const memberRepo = repo(ServiceTeamMember);
		await memberRepo.save(
			memberRepo.create({
				serviceTeamId: oldTeam.id,
				participantId: leader.id,
				role: 'miembro',
			} as any),
		);

		const result = await cloneFromRetreat(
			target.id,
			source.id,
			only('tables', 'responsibilities', 'serviceTeams'),
			'actor-1',
		);

		expect(result.sections.responsibilities).toBe(1);
		expect(result.sections.tables).toBe(2);
		expect(result.sections.serviceTeams).toBe(1);

		// Responsibilities copied without holder; default replaced.
		const targetResps = await respRepo.find({ where: { retreatId: target.id } });
		expect(targetResps.map((r: any) => r.name)).toEqual(['Sacerdotes']);
		expect(targetResps[0].participantId).toBeFalsy();
		expect(targetResps[0].description).toBe('Acompañar las charlas');

		// Tables copied as structure only.
		const targetMesas = await mesaRepo.find({ where: { retreatId: target.id } });
		expect(targetMesas.map((m: any) => m.name).sort()).toEqual(['Mesa 1', 'Mesa 2']);
		expect(targetMesas.every((m: any) => !m.liderId)).toBe(true);

		// Teams copied without leader; old team AND its members are gone.
		const targetTeams = await teamRepo.find({ where: { retreatId: target.id } });
		expect(targetTeams.map((t: any) => t.name)).toEqual(['Compras']);
		expect(targetTeams[0].leaderId).toBeFalsy();
		expect(await memberRepo.count({ where: { serviceTeamId: oldTeam.id } })).toBe(0);

		// Audit row with source + section counts.
		const audit = await waitForCloneAudit(target.id);
		expect(audit).toBeDefined();
		expect(audit!.actorUserId).toBe('actor-1');
		const meta = JSON.parse(audit!.metadata ?? '{}');
		expect(meta.sourceRetreatId).toBe(source.id);
		expect(meta.counts.tables).toBe(2);
	});

	it('remaps shirt types and copies inventory with currentQuantity reset to 0', async () => {
		const source = await makeRetreat('Fuente', SOURCE_START);
		const target = await makeRetreat('Destino', TARGET_START);

		const typeRepo = repo(RetreatShirtType);
		const srcType = await typeRepo.save(
			typeRepo.create({ retreatId: source.id, name: 'Playera Hombre' } as any),
		);
		const priceRepo = repo(RetreatShirtTypeSizePrice);
		await priceRepo.save(
			priceRepo.create({ shirtTypeId: srcType.id, size: 'M', price: 250 } as any),
		);

		const [item] = await TestDataFactory.createTestInventoryItems(1);
		const invRepo = repo(RetreatInventory);
		await invRepo.save(
			invRepo.create({
				retreatId: source.id,
				inventoryItemId: item.id,
				requiredQuantity: 5,
				currentQuantity: 5,
				isSufficient: true,
				status: 'packed',
				notes: 'caja verde',
				boxLabel: 'C-12',
			} as any),
		);
		await invRepo.save(
			invRepo.create({
				retreatId: source.id,
				retreatShirtTypeId: srcType.id,
				requiredQuantity: 40,
				currentQuantity: 40,
				isSufficient: true,
			} as any),
		);

		// Target default with history row: the FK must not break the delete.
		const oldRow = await invRepo.save(
			invRepo.create({ retreatId: target.id, inventoryItemId: item.id, requiredQuantity: 1 } as any),
		);
		const histRepo = repo(RetreatInventoryHistory);
		await histRepo.save(
			histRepo.create({
				retreatInventoryId: oldRow.id,
				retreatId: target.id,
				inventoryItemId: item.id,
				field: 'currentQuantity',
				oldValue: '0',
				newValue: '1',
			} as any),
		);

		const result = await cloneFromRetreat(target.id, source.id, only('inventory', 'shirtTypes'));

		expect(result.sections.shirtTypes).toBe(1);
		expect(result.sections.inventory).toBe(2);
		expect(result.warnings).toEqual([]);

		const targetTypes = await typeRepo.find({ where: { retreatId: target.id } });
		expect(targetTypes).toHaveLength(1);
		const newType = targetTypes[0] as any;
		expect(newType.id).not.toBe(srcType.id); // remapped
		const newPrices = await priceRepo.find({ where: { shirtTypeId: newType.id } });
		expect(newPrices.map((p: any) => p.size)).toEqual(['M']);
		expect(Number((newPrices[0] as any).price)).toBe(250);

		const targetInv = await invRepo.find({ where: { retreatId: target.id } });
		expect(targetInv).toHaveLength(2);
		for (const row of targetInv as any[]) {
			expect(Number(row.currentQuantity)).toBe(0); // stock reset
			expect(row.status).toBe('pending');
			expect(Number(row.requiredQuantity)).toBeGreaterThan(0);
		}
		// Catalog row keeps notes/box; required preserved from source.
		const catRow = targetInv.find((r: any) => r.inventoryItemId === item.id) as any;
		expect(catRow.notes).toBe('caja verde');
		expect(catRow.boxLabel).toBe('C-12');
		expect(Number(catRow.requiredQuantity)).toBe(5);
		// Shirt row points at the NEW type id.
		const shirtRow = targetInv.find((r: any) => r.retreatShirtTypeId) as any;
		expect(shirtRow.retreatShirtTypeId).toBe(newType.id);
		// Old default row (and its history) replaced.
		expect(await invRepo.count({ where: { id: oldRow.id } as any })).toBe(0);
	});

	it('skips shirt inventory rows with a warning when shirtTypes is off', async () => {
		const source = await makeRetreat('Fuente', SOURCE_START);
		const target = await makeRetreat('Destino', TARGET_START);

		const typeRepo = repo(RetreatShirtType);
		const srcType = await typeRepo.save(
			typeRepo.create({ retreatId: source.id, name: 'Playera Hombre' } as any),
		);
		const invRepo = repo(RetreatInventory);
		await invRepo.save(
			invRepo.create({
				retreatId: source.id,
				retreatShirtTypeId: srcType.id,
				requiredQuantity: 10,
			} as any),
		);

		const result = await cloneFromRetreat(target.id, source.id, only('inventory'));

		expect(result.sections.inventory).toBe(0);
		expect(result.warnings.some((w) => w.includes('tallas'))).toBe(true);
		expect(await invRepo.count({ where: { retreatId: target.id } })).toBe(0);
	});

	it('copies templates and sequences with id remaps and no archived steps', async () => {
		const source = await makeRetreat('Fuente', SOURCE_START);
		const target = await makeRetreat('Destino', TARGET_START);

		const tmplRepo = repo(MessageTemplate);
		const srcTemplate = await tmplRepo.save(
			tmplRepo.create({
				name: 'Bienvenida',
				type: 'WALKER_WELCOME',
				scope: 'retreat',
				retreatId: source.id,
				message: 'Hola {participant.nickname}',
				isDefault: true,
			} as any),
		);
		const seqRepo = repo(MessageSequence);
		const srcSeq = await seqRepo.save(
			seqRepo.create({
				retreatId: source.id,
				name: 'Bienvenida caminantes',
				trigger: 'participant_created',
				audience: 'walker',
				isActive: true,
				segmentId: '00000000-0000-4000-8000-000000000004',
			} as any),
		);
		const stepRepo = repo(SequenceStep);
		await stepRepo.save(
			stepRepo.create({
				sequenceId: srcSeq.id,
				stepOrder: 0,
				offsetDays: 0,
				sendHour: 9,
				templateType: 'WALKER_WELCOME',
				templateId: srcTemplate.id,
				channel: 'email',
				recipientTarget: 'participant',
			} as any),
		);
		await stepRepo.save(
			stepRepo.create({
				sequenceId: srcSeq.id,
				stepOrder: 1,
				offsetDays: 3,
				sendHour: 9,
				templateType: 'WALKER_WELCOME',
				channel: 'whatsapp',
				recipientTarget: 'participant',
				isArchived: true, // must NOT travel
			} as any),
		);

		// Target default template replaced by the copy.
		await tmplRepo.save(
			tmplRepo.create({
				name: 'Default copiado de global',
				type: 'GENERAL',
				scope: 'retreat',
				retreatId: target.id,
				message: 'x',
			} as any),
		);

		const result = await cloneFromRetreat(
			target.id,
			source.id,
			only('messageTemplates', 'messageSequences'),
		);

		expect(result.sections.messageTemplates).toBe(1);
		expect(result.sections.messageSequences).toBe(1);
		expect(result.sections.sequenceSteps).toBe(1); // archived step excluded
		expect(result.warnings.some((w) => w.includes('segmento'))).toBe(true);

		const targetTemplates = await tmplRepo.find({ where: { retreatId: target.id } });
		expect(targetTemplates.map((t: any) => t.name)).toEqual(['Bienvenida']);
		const newTemplate = targetTemplates[0] as any;
		expect(newTemplate.id).not.toBe(srcTemplate.id);

		const targetSeqs = await seqRepo.find({ where: { retreatId: target.id } });
		expect(targetSeqs).toHaveLength(1);
		const newSeq = targetSeqs[0] as any;
		// clonedFrom is audit-only metadata (not a column) — the row itself
		// just carries name/trigger/audience.
		expect(newSeq.name).toBe('Bienvenida caminantes');
		expect(newSeq.trigger).toBe('participant_created');
		expect(newSeq.segmentId).toBeFalsy(); // segments are per-retreat
		const newSteps = await stepRepo.find({ where: { sequenceId: newSeq.id } });
		expect(newSteps).toHaveLength(1);
		expect((newSteps[0] as any).templateId).toBe(newTemplate.id); // remapped
	});

	it('re-anchors schedule items to the target dates and remaps responsabilityId by name', async () => {
		const source = await makeRetreat('Fuente', SOURCE_START);
		const target = await makeRetreat('Destino', TARGET_START);

		const respRepo = repo(Responsability);
		const srcResp = await respRepo.save(
			respRepo.create({ retreatId: source.id, name: 'Sacerdotes' } as any),
		);
		const itemRepo = repo(RetreatScheduleItem);
		await itemRepo.save(
			itemRepo.create({
				retreatId: source.id,
				name: 'Charla 1 — Dios te ama',
				type: 'charla',
				day: 2,
				startTime: new Date('2026-10-03T12:00:00.000Z'),
				endTime: new Date('2026-10-03T13:00:00.000Z'),
				durationMinutes: 60,
				orderInDay: 1,
				responsabilityId: srcResp.id,
				location: 'Salón',
			} as any),
		);
		// Target default schedule item replaced.
		await itemRepo.save(
			itemRepo.create({
				retreatId: target.id,
				name: 'Default item',
				type: 'otro',
				day: 1,
				startTime: TARGET_START,
				endTime: new Date(TARGET_START.getTime() + 30 * 60_000),
				durationMinutes: 30,
			} as any),
		);

		const result = await cloneFromRetreat(
			target.id,
			source.id,
			only('responsibilities', 'schedule'),
		);

		expect(result.sections.schedule).toBe(1);
		expect(result.warnings).toEqual([]);

		const targetItems = await itemRepo.find({ where: { retreatId: target.id } });
		expect(targetItems.map((i: any) => i.name)).toEqual(['Charla 1 — Dios te ama']);
		const cloned = targetItems[0] as any;
		// Wall clock (12:00 UTC) kept, re-anchored to target day 2 = 2027-03-06.
		expect(new Date(cloned.startTime).toISOString()).toBe('2027-03-06T12:00:00.000Z');
		expect(new Date(cloned.endTime).toISOString()).toBe('2027-03-06T13:00:00.000Z');
		expect(cloned.status).toBe('pending');
		expect(cloned.location).toBe('Salón');
		// Remapped to the TARGET's own responsibility (copied earlier), not the source id.
		expect(cloned.responsabilityId).toBeTruthy();
		expect(cloned.responsabilityId).not.toBe(srcResp.id);
		const targetResp = await respRepo.findOne({ where: { retreatId: target.id, name: 'Sacerdotes' } });
		expect(cloned.responsabilityId).toBe((targetResp as any)?.id);
	});

	it('reports unmatched responsibilities when the schedule is copied without them', async () => {
		const source = await makeRetreat('Fuente', SOURCE_START);
		const target = await makeRetreat('Destino', TARGET_START);

		const respRepo = repo(Responsability);
		const srcResp = await respRepo.save(
			respRepo.create({ retreatId: source.id, name: 'Sacerdotes' } as any),
		);
		const itemRepo = repo(RetreatScheduleItem);
		await itemRepo.save(
			itemRepo.create({
				retreatId: source.id,
				name: 'Misa',
				type: 'misa',
				day: 1,
				startTime: new Date('2026-10-02T12:00:00.000Z'),
				endTime: new Date('2026-10-02T13:00:00.000Z'),
				durationMinutes: 60,
				responsabilityId: srcResp.id,
			} as any),
		);

		const result = await cloneFromRetreat(target.id, source.id, only('schedule'));

		expect(result.sections.schedule).toBe(1);
		expect(result.warnings.some((w) => w.includes('Sacerdotes'))).toBe(true);
		const cloned = await itemRepo.findOne({ where: { retreatId: target.id } });
		expect((cloned as any)?.responsabilityId).toBeFalsy();
	});

	it('recomputes pre-retreat task dueDates from the effective offset and drops assignees', async () => {
		const source = await makeRetreat('Fuente', SOURCE_START);
		const target = await makeRetreat('Destino', TARGET_START);
		const assignee = await TestDataFactory.createTestParticipant(source.id);

		const taskRepo = repo(RetreatPreRetreatTask);
		const root = await taskRepo.save(
			taskRepo.create({
				retreatId: source.id,
				name: 'Comprar playeras',
				dueOffsetDays: 7, // positive = days BEFORE the retreat (preRetreatTaskTime.ts)
				sortOrder: 1,
				responsibleParticipantId: assignee.id,
				responsibleText: 'Coordinador de playeras',
			} as any),
		);
		await taskRepo.save(
			taskRepo.create({
				retreatId: source.id,
				parentId: root.id,
				name: 'Confirmar tallas',
				dueOffsetDays: null, // inherits the root's +7
				sortOrder: 2,
				status: 'done',
			} as any),
		);
		// Target default task replaced.
		await taskRepo.save(
			taskRepo.create({ retreatId: target.id, name: 'Default tarea', sortOrder: 1 } as any),
		);

		const result = await cloneFromRetreat(target.id, source.id, only('preRetreatTasks'));

		expect(result.sections.preRetreatTasks).toBe(2);

		const tasks = await taskRepo.find({ where: { retreatId: target.id } });
		expect(tasks.map((t: any) => t.name).sort()).toEqual(['Comprar playeras', 'Confirmar tallas']);
		for (const t of tasks as any[]) {
			expect(t.status).toBe('pending');
			expect(t.responsibleParticipantId).toBeFalsy();
		}
		const rootTask = tasks.find((t: any) => t.name === 'Comprar playeras') as any;
		expect(rootTask.responsibleText).toBe('Coordinador de playeras');
		// Target starts 2027-03-05 → 7 days before → 2027-02-26 (root and child alike).
		expect(String(rootTask.dueDate).slice(0, 10)).toBe('2027-02-26');
		const childTask = tasks.find((t: any) => t.name === 'Confirmar tallas') as any;
		expect(childTask.parentId).toBe(rootTask.id); // parent remapped
		expect(String(childTask.dueDate).slice(0, 10)).toBe('2027-02-26');
	});

	it('leaves the target defaults untouched for sections that are off', async () => {
		const source = await makeRetreat('Fuente', SOURCE_START);
		const target = await makeRetreat('Destino', TARGET_START);

		const mesaRepo = repo(TableMesa);
		await mesaRepo.save(mesaRepo.create({ retreatId: source.id, name: 'Mesa origen' } as any));
		const [item] = await TestDataFactory.createTestInventoryItems(1);
		const invRepo = repo(RetreatInventory);
		const defaultInv = await invRepo.save(
			invRepo.create({ retreatId: target.id, inventoryItemId: item.id, requiredQuantity: 3 } as any),
		);

		const result = await cloneFromRetreat(target.id, source.id, only('tables'));

		expect(result.sections.tables).toBe(1);
		// Inventory untouched: the default row survives with its quantity.
		const kept = await invRepo.findOne({ where: { id: defaultInv.id } as any });
		expect(kept).toBeTruthy();
		expect(result.sections.inventory).toBe(0);
	});

	it('rejects self-clone (400), missing retreats (404) and targets with enrolled participants (409)', async () => {
		const source = await makeRetreat('Fuente', SOURCE_START);
		const target = await makeRetreat('Destino', TARGET_START);

		await expect(cloneFromRetreat(target.id, target.id, ALL_SECTIONS)).rejects.toMatchObject({
			statusCode: 400,
		});
		await expect(
			cloneFromRetreat(target.id, '00000000-0000-4000-8000-00000000000a', ALL_SECTIONS),
		).rejects.toMatchObject({ statusCode: 404 });
		await expect(
			cloneFromRetreat('00000000-0000-4000-8000-00000000000b', source.id, ALL_SECTIONS),
		).rejects.toMatchObject({ statusCode: 404 });

		const rpRepo = repo(RetreatParticipant);
		await rpRepo.save(
			rpRepo.create({ retreatId: target.id, roleInRetreat: 'walker', isCancelled: false } as any),
		);
		await expect(cloneFromRetreat(target.id, source.id, ALL_SECTIONS)).rejects.toMatchObject({
			statusCode: 409,
		});

		// A cancelled enrollment does not block the copy.
		await rpRepo.update({ retreatId: target.id } as any, { isCancelled: true });
		await expect(cloneFromRetreat(target.id, source.id, ALL_SECTIONS)).resolves.toBeTruthy();
	});
});
