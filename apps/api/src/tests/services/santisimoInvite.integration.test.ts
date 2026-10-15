/**
 * Integration test (TypeORM real, vía testDataSource) del enlace personal
 * cifrado de guardias del Santísimo (specs/santisimo-guardia-links).
 *
 * Cubre el contrato del service:
 *  - getInviteData: whitelist de respuesta, slots pasados ocultos, flag
 *    `selectable` (lleno vs propio), mealWindow visible (decisión 2) y el
 *    404 uniforme (retiro sin santísimo, participante borrado, sin membresía).
 *  - inviteSignup: crea el signup ligado al participante, reemplaza la guardia
 *    previa (un solo horario), idempotencia sobre su propio slot, capacidad
 *    sin contar su cupo, disabled/pasado/otro retiro.
 *  - inviteCancel: quita SOLO las guardias del retiro del token, libera cupo.
 *  - Audit: acciones invite_signup/invite_cancel con participantId e IP, sin
 *    el token/URL (bearer secret).
 *
 * El singleton `santisimoService` se construye al importar el módulo, antes
 * del swap de AppDataSource: aquí se instancia la clase fresca en cada test
 * (mismo patrón que santisimoMaterializeAutogen con RetreatScheduleService).
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { SantisimoSlot } from '@/entities/santisimoSlot.entity';
import { SantisimoSignup } from '@/entities/santisimoSignup.entity';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import {
	SantisimoService,
	SantisimoCapacityError,
	SantisimoDisabledError,
	SantisimoNotFoundError,
	SantisimoPastError,
} from '@/services/santisimoService';
import { v4 as uuidv4 } from 'uuid';

const getDS = () => (TestDataFactory as any)['testDataSource'];

// §25.3: el audit INSERT es fire-and-forget; esperar la fila antes de abrir
// la siguiente transacción del service (evita TransactionNotStartedError).
async function awaitAuditRow(action: string, resourceId: string): Promise<DomainAuditLog> {
	const auditRepo = getDS().getRepository(DomainAuditLog);
	for (let i = 0; i < 60; i++) {
		const found = await auditRepo.findOne({ where: { action, resourceId } });
		if (found) return found;
		await new Promise((r) => setTimeout(r, 5));
	}
	throw new Error(`audit row not seen: ${action} for ${resourceId}`);
}

function hoursFromNow(h: number): Date {
	return new Date(Date.now() + h * 60 * 60 * 1000);
}

describe('SantisimoService — enlace personal cifrado (integration)', () => {
	let service: SantisimoService;
	let retreat: any;
	let server: any;

	const makeSlot = async (opts: Partial<SantisimoSlot> = {}) => {
		const repo = getDS().getRepository(SantisimoSlot);
		return repo.save(
			repo.create({
				id: uuidv4(),
				retreatId: retreat.id,
				startTime: hoursFromNow(1),
				endTime: hoursFromNow(2),
				capacity: 1,
				mealWindow: false,
				...opts,
			} as any),
		);
	};

	const makeSignup = (slotId: string, participantId: string, name = 'Otro Participante') => {
		const repo = getDS().getRepository(SantisimoSignup);
		return repo.save(
			repo.create({
				id: uuidv4(),
				slotId,
				participantId,
				name,
				isAngelito: false,
				autoAssigned: false,
				cancelToken: null,
			} as any),
		);
	};

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		const ds = getDS();
		await ds.getRepository(SantisimoSignup).clear();
		await ds.getRepository(SantisimoSlot).clear();
		await clearTestData();

		retreat = await TestDataFactory.createTestRetreat({ santisimoEnabled: true } as any);
		server = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
		// Fresco y DESPUÉS del swap de AppDataSource (repos eager de la clase).
		service = new SantisimoService();
	});

	describe('getInviteData', () => {
		it('lista slots futuros con su cupo y oculta los pasados', async () => {
			const past = await makeSlot({ startTime: hoursFromNow(-3), endTime: hoursFromNow(-2) });
			const future = await makeSlot();

			const data = await service.getInviteData(retreat.id, server.id);

			expect(data).not.toBeNull();
			expect(data!.participant.firstName).toBe('Test');
			expect(data!.participant.fullName).toContain('Test Participant');
			expect(data!.retreat.parish).toBe(retreat.parish);
			expect(data!.current).toBeNull();
			const ids = data!.slots.map((s) => s.id);
			expect(ids).toContain(future.id);
			expect(ids).not.toContain(past.id);
			const view = data!.slots.find((s) => s.id === future.id)!;
			expect(view.selectable).toBe(true);
			expect(view.capacity).toBe(1);
			expect(view.signedUpCount).toBe(0);
		});

		it('muestra mealWindow visible y seleccionable (decisión 2: solo se anuncia)', async () => {
			const meal = await makeSlot({ mealWindow: true });

			const data = await service.getInviteData(retreat.id, server.id);

			const view = data!.slots.find((s) => s.id === meal.id)!;
			expect(view.mealWindow).toBe(true);
			expect(view.selectable).toBe(true);
		});

		it('slot lleno por otro no es seleccionable; el propio sí (aunque esté "lleno")', async () => {
			const other = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
			const mine = await makeSlot();
			const full = await makeSlot({ startTime: hoursFromNow(3), endTime: hoursFromNow(4) });
			await makeSignup(full.id, other.id);
			await makeSignup(mine.id, server.id, 'Test Participant Yo');

			const data = await service.getInviteData(retreat.id, server.id);

			expect(data!.current).not.toBeNull();
			expect(data!.current!.slotId).toBe(mine.id);
			expect(data!.slots.find((s) => s.id === full.id)!.selectable).toBe(false);
			expect(data!.slots.find((s) => s.id === mine.id)!.selectable).toBe(true);
			expect(data!.slots.find((s) => s.id === full.id)!.signedUpCount).toBe(1);
		});

		it('retorna null (404 uniforme) para los contextos inválidos', async () => {
			const noSantisimo = await TestDataFactory.createTestRetreat({ santisimoEnabled: false } as any);
			const serverNoSantisimo = await TestDataFactory.createTestParticipant(noSantisimo.id, {
				type: 'server',
			} as any);

			const ds = getDS();
			const deleted = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
			await ds.getRepository('Participant').update(deleted.id, { dataDeletedAt: new Date() } as any);

			const cancelled = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'server',
				isCancelled: true,
			} as any);

			expect(await service.getInviteData(uuidv4(), server.id)).toBeNull(); // retiro inexistente
			expect(await service.getInviteData(noSantisimo.id, serverNoSantisimo.id)).toBeNull(); // sin santísimo
			expect(await service.getInviteData(retreat.id, deleted.id)).toBeNull(); // borrado
			expect(await service.getInviteData(retreat.id, cancelled.id)).toBeNull(); // membresía cancelada
			expect(await service.getInviteData(retreat.id, uuidv4())).toBeNull(); // participante inexistente
		});
	});

	describe('inviteSignup', () => {
		it('crea el signup ligado al participante con su nombre completo y sin cancelToken', async () => {
			const slot = await makeSlot();

			const result = await service.inviteSignup(retreat.id, server.id, slot.id, '203.0.113.7');

			expect(result.slotId).toBe(slot.id);
			const repo = getDS().getRepository(SantisimoSignup);
			const rows = await repo.find({ where: { participantId: server.id } });
			expect(rows).toHaveLength(1);
			expect(rows[0].slotId).toBe(slot.id);
			expect(rows[0].name).toBe(`Test ${server.lastName}`);
			expect(rows[0].phone).toBe(server.cellPhone);
			expect(rows[0].email).toBe(server.email);
			expect(rows[0].cancelToken).toBeNull();
			expect(rows[0].isAngelito).toBe(false);
			expect(rows[0].autoAssigned).toBe(false);

			const audit = await awaitAuditRow('santisimo_signup.invite_signup', rows[0].id);
			expect(audit.retreatId).toBe(retreat.id);
			expect(audit.ipAddress).toBe('203.0.113.7');
			const meta = JSON.parse(audit.metadata ?? '{}');
			expect(meta.participantId).toBe(server.id);
			expect(meta.slotId).toBe(slot.id);
			// El token/URL jamás entra al evento (bearer secret).
			expect(JSON.stringify(audit)).not.toContain('invite/');
			expect(meta.token).toBeUndefined();
		});

		it('reemplaza la guardia previa: un solo horario por servidor', async () => {
			const slotA = await makeSlot();
			const slotB = await makeSlot({ startTime: hoursFromNow(3), endTime: hoursFromNow(4) });

			await service.inviteSignup(retreat.id, server.id, slotA.id);
			const repo = getDS().getRepository(SantisimoSignup);
			const firstRow = (await repo.find({ where: { participantId: server.id } }))[0];
			await awaitAuditRow('santisimo_signup.invite_signup', firstRow.id);

			const second = await service.inviteSignup(retreat.id, server.id, slotB.id);

			expect(second.slotId).toBe(slotB.id);
			const rows = await repo.find({ where: { participantId: server.id } });
			expect(rows).toHaveLength(1);
			expect(rows[0].slotId).toBe(slotB.id);

			const audit = await awaitAuditRow('santisimo_signup.invite_signup', rows[0].id);
			expect(JSON.parse(audit.metadata ?? '{}').replacedCount).toBe(1);
		});

		it('re-guardar su propio slot es idempotente aunque el cupo esté "lleno" con su signup', async () => {
			const slot = await makeSlot();
			await service.inviteSignup(retreat.id, server.id, slot.id);
			const repo = getDS().getRepository(SantisimoSignup);
			const firstRow = (await repo.find({ where: { participantId: server.id } }))[0];
			await awaitAuditRow('santisimo_signup.invite_signup', firstRow.id);

			const again = await service.inviteSignup(retreat.id, server.id, slot.id);

			expect(again.slotId).toBe(slot.id);
			expect(await repo.find({ where: { participantId: server.id } })).toHaveLength(1);
		});

		it('rechaza con Capacity cuando otro participante ocupa el cupo', async () => {
			const other = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
			const slot = await makeSlot();
			await makeSignup(slot.id, other.id);

			await expect(service.inviteSignup(retreat.id, server.id, slot.id)).rejects.toBeInstanceOf(
				SantisimoCapacityError,
			);
		});

		it('rechaza slots disabled, pasados y de otro retiro', async () => {
			const disabled = await makeSlot({ isDisabled: true });
			const past = await makeSlot({ startTime: hoursFromNow(-3), endTime: hoursFromNow(-2) });
			const otherRetreat = await TestDataFactory.createTestRetreat({ santisimoEnabled: true } as any);
			const foreignSlot = await makeSlot({ retreatId: otherRetreat.id });

			await expect(service.inviteSignup(retreat.id, server.id, disabled.id)).rejects.toBeInstanceOf(
				SantisimoDisabledError,
			);
			await expect(service.inviteSignup(retreat.id, server.id, past.id)).rejects.toBeInstanceOf(
				SantisimoPastError,
			);
			await expect(service.inviteSignup(retreat.id, server.id, foreignSlot.id)).rejects.toBeInstanceOf(
				SantisimoNotFoundError,
			);
			await expect(service.inviteSignup(retreat.id, server.id, uuidv4())).rejects.toBeInstanceOf(
				SantisimoNotFoundError,
			);
		});

		it('contexto inválido del token → NotFound uniforme (sin distinguir la causa)', async () => {
			const slot = await makeSlot();
			const noSantisimo = await TestDataFactory.createTestRetreat({ santisimoEnabled: false } as any);

			await expect(service.inviteSignup(noSantisimo.id, server.id, slot.id)).rejects.toBeInstanceOf(
				SantisimoNotFoundError,
			);
			await expect(service.inviteSignup(retreat.id, uuidv4(), slot.id)).rejects.toBeInstanceOf(
				SantisimoNotFoundError,
			);
		});
	});

	describe('inviteCancel', () => {
		it('quita su guardia del retiro, audita y libera el cupo', async () => {
			const slot = await makeSlot({ capacity: 1 });
			const other = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
			await service.inviteSignup(retreat.id, server.id, slot.id);
			const repo = getDS().getRepository(SantisimoSignup);
			const mineRow = (await repo.find({ where: { participantId: server.id } }))[0];
			await awaitAuditRow('santisimo_signup.invite_signup', mineRow.id);

			const ok = await service.inviteCancel(retreat.id, server.id, '203.0.113.9');

			expect(ok).toBe(true);
			expect(await repo.find({ where: { participantId: server.id } })).toHaveLength(0);

			const audit = await awaitAuditRow('santisimo_signup.invite_cancel', mineRow.id);
			const meta = JSON.parse(audit.metadata ?? '{}');
			expect(meta.via).toBe('invite_token');
			expect(meta.participantId).toBe(server.id);

			// El cupo liberado permite que otro servidor se inscriba.
			await expect(service.inviteSignup(retreat.id, other.id, slot.id)).resolves.toMatchObject({
				slotId: slot.id,
			});
		});

		it('sin guardia previa devuelve false', async () => {
			expect(await service.inviteCancel(retreat.id, server.id)).toBe(false);
		});

		it('solo toca las guardias del retiro del token', async () => {
			const otherRetreat = await TestDataFactory.createTestRetreat({ santisimoEnabled: true } as any);
			const rpRepo = getDS().getRepository(RetreatParticipant);
			await rpRepo.save(
				rpRepo.create({
					participantId: server.id,
					retreatId: otherRetreat.id,
					roleInRetreat: 'server',
					type: 'server',
					isCancelled: false,
					idOnRetreat: 2,
					isPrimaryRetreat: false,
				} as any),
			);
			const slotA = await makeSlot();
			const slotB = await makeSlot({ retreatId: otherRetreat.id });
			await service.inviteSignup(retreat.id, server.id, slotA.id);
			const repo = getDS().getRepository(SantisimoSignup);
			const rowA = (await repo.find({ where: { participantId: server.id } }))[0];
			await awaitAuditRow('santisimo_signup.invite_signup', rowA.id);
			await service.inviteSignup(otherRetreat.id, server.id, slotB.id);
			const rowsB = await repo.find({ where: { participantId: server.id, slotId: slotB.id } });
			await awaitAuditRow('santisimo_signup.invite_signup', rowsB[0].id);

			expect(await service.inviteCancel(retreat.id, server.id)).toBe(true);

			const remaining = await repo.find({ where: { participantId: server.id } });
			expect(remaining).toHaveLength(1);
			expect(remaining[0].slotId).toBe(slotB.id);
		});
	});
});
