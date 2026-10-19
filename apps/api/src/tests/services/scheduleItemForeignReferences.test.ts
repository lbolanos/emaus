/**
 * A schedule item may only link its own retreat's responsibility and
 * participants: linking someone from another retreat would show their name in
 * this retreat's schedule. Links that already exist stay valid on edit.
 */
import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Responsability, ResponsabilityType } from '@/entities/responsability.entity';
import { RetreatScheduleItem } from '@/entities/retreatScheduleItem.entity';
import { RetreatScheduleItemResponsable } from '@/entities/retreatScheduleItemResponsable.entity';
import {
	RetreatScheduleService,
	ScheduleForeignReferenceError,
} from '@/services/retreatScheduleService';
import { v4 as uuidv4 } from 'uuid';

describe('RetreatScheduleService — references from another retreat', () => {
	const getDS = () => TestDataFactory['testDataSource'];
	let service: RetreatScheduleService;
	let ownRetreatId: string;
	let ownServerId: string;
	let foreignServerId: string;
	let foreignResponsabilityId: string;
	let itemId: string;

	beforeAll(async () => {
		await setupTestDatabase();
		service = new RetreatScheduleService();
		const ds = getDS();

		const own = await TestDataFactory.createTestRetreat();
		const foreign = await TestDataFactory.createTestRetreat();
		ownRetreatId = own.id;
		ownServerId = (
			await TestDataFactory.createTestParticipant(own.id, { type: 'server', email: `own-${uuidv4()}@x.com` } as any)
		).id;
		foreignServerId = (
			await TestDataFactory.createTestParticipant(foreign.id, { type: 'server', email: `far-${uuidv4()}@x.com` } as any)
		).id;
		foreignResponsabilityId = (
			await ds.getRepository(Responsability).save({
				retreatId: foreign.id,
				name: 'Comedor',
				responsabilityType: ResponsabilityType.COCINA,
			} as Partial<Responsability>)
		).id;

		const item = await ds.getRepository(RetreatScheduleItem).save({
			retreatId: own.id,
			name: 'Cena',
			day: 1,
			startTime: new Date('2026-10-17T01:00:00.000Z'),
			endTime: new Date('2026-10-17T02:00:00.000Z'),
		} as Partial<RetreatScheduleItem>);
		itemId = item.id;
		// A legacy link to someone outside the retreat: editing must not break on it.
		await ds
			.getRepository(RetreatScheduleItemResponsable)
			.save({ scheduleItemId: itemId, participantId: foreignServerId } as Partial<RetreatScheduleItemResponsable>);
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	it('findItemRetreatId resolves the item retreat, null for unknown ids', async () => {
		expect(await service.findItemRetreatId(itemId)).toBe(ownRetreatId);
		expect(await service.findItemRetreatId(uuidv4())).toBeNull();
	});

	it('create rejects a responsable from another retreat', async () => {
		await expect(
			service.create(ownRetreatId, {
				name: 'Charla',
				day: 1,
				responsableParticipantIds: [ownServerId, foreignServerId],
			} as any),
		).rejects.toBeInstanceOf(ScheduleForeignReferenceError);
	});

	it("update rejects another retreat's responsibility", async () => {
		await expect(
			service.update(itemId, { responsabilityId: foreignResponsabilityId } as any),
		).rejects.toBeInstanceOf(ScheduleForeignReferenceError);
	});

	it('update keeps existing links valid and accepts new ones from the same retreat', async () => {
		const updated = await service.update(itemId, {
			name: 'Cena (editada)',
			responsableParticipantIds: [foreignServerId, ownServerId],
		} as any);
		expect(updated?.name).toBe('Cena (editada)');
		const ids = (updated?.responsables ?? []).map((r) => r.participantId).sort();
		expect(ids).toEqual([foreignServerId, ownServerId].sort());
	});
});
