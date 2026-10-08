import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { SantisimoService } from '@/services/santisimoService';
import { auditContext } from '@/utils/auditContext';

// Tanda P2, bloque B: los turnos del Santísimo y sus inscripciones (públicas
// y de servidor) mutaban sin rastro. El CRUD de slots, la generación masiva
// y las inscripciones ahora dejan fila; teléfono y correo NO entran al log.
describe('Santísimo — auditoría de dominio', () => {
	// Instancia local (no el singleton): el servicio liga sus repos como
	// campos de instancia al construirse, y el singleton nace antes del
	// setupTestDatabase — contra el DataSource sin inicializar.
	let santisimo: SantisimoService;

	beforeAll(async () => {
		await setupTestDatabase();
		santisimo = new SantisimoService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const auditRepo = () => AppDataSource.getRepository(DomainAuditLog);

	async function waitForLogs(
		predicate: (rows: DomainAuditLog[]) => boolean,
		tries = 60,
		delayMs = 5,
	): Promise<DomainAuditLog[]> {
		let rows = await auditRepo().find();
		for (let i = 0; i < tries && !predicate(rows); i++) {
			await new Promise((r) => setTimeout(r, delayMs));
			rows = await auditRepo().find();
		}
		return rows;
	}

	const rowsOf = (rows: DomainAuditLog[], action: string) =>
		rows.filter((r) => r.action === action);
	const meta = (row: DomainAuditLog) => JSON.parse(row.metadata ?? '{}');

	const inTwoHours = () => new Date(Date.now() + 2 * 60 * 60 * 1000);
	const inThreeHours = () => new Date(Date.now() + 3 * 60 * 60 * 1000);

	it('create/update/delete de slot con retreatId, actor y notesChars', async () => {
		const actor = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: actor.id });

		await auditContext.run({ userId: actor.id, ip: '10.0.0.41' }, async () => {
			const slot = await santisimo.createSlot(retreat.id, {
				startTime: inTwoHours(),
				endTime: inThreeHours(),
				capacity: 2,
				notes: 'Turno de la madrugada',
			});
			await santisimo.updateSlot(slot.id, { capacity: 3 });
			await santisimo.deleteSlot(slot.id);
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'santisimo_slot.delete').length > 0);
		const create = rowsOf(rows, 'santisimo_slot.create')[0];
		expect(create.resourceType).toBe('santisimo_slot');
		expect(create.retreatId).toBe(retreat.id);
		expect(create.actorUserId).toBe(actor.id);
		expect(create.ipAddress).toBe('10.0.0.41');
		expect(JSON.parse(create.newValues!)).toMatchObject({ capacity: 2 });
		// notes no entra al diff: solo su tamaño.
		expect(JSON.parse(create.newValues!)).not.toHaveProperty('notes');
		expect(meta(create).notesChars).toBe('Turno de la madrugada'.length);

		const update = rowsOf(rows, 'santisimo_slot.update')[0];
		expect(JSON.parse(update.oldValues!)).toMatchObject({ capacity: 2 });
		expect(JSON.parse(update.newValues!)).toMatchObject({ capacity: 3 });

		const del = rowsOf(rows, 'santisimo_slot.delete')[0];
		expect(del.retreatId).toBe(retreat.id);
		expect(JSON.parse(del.oldValues!)).toMatchObject({ capacity: 3 });
	});

	it('generateSlots deja UN evento agregado con cleared/cascadeSignups/created', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const slot = await santisimo.createSlot(retreat.id, {
			startTime: inTwoHours(),
			endTime: inThreeHours(),
		});
		// Flush del create antes de generar (clearExisting borra y recrea).
		await waitForLogs((r) => rowsOf(r, 'santisimo_slot.create').length >= 1);
		// El signup muere en cascada con su slot: si no se cuenta ANTES del
		// delete, el agregado reportaría cascadeSignups 0 (la fila ya no existe).
		await santisimo.adminCreateSignup(retreat.id, {
			slotId: slot.id,
			name: 'María López',
		});

		await santisimo.generateSlots(retreat.id, {
			startDateTime: inTwoHours(),
			endDateTime: inThreeHours(),
			slotMinutes: 30,
			capacity: 2,
			clearExisting: true,
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'santisimo_slot.generate').length > 0);
		const row = rowsOf(rows, 'santisimo_slot.generate')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(meta(row)).toMatchObject({
			slotMinutes: 30,
			capacity: 2,
			clearExisting: true,
			cleared: 1,
		});
		expect(meta(row).created).toBe(2);
		expect(meta(row).skippedExisting).toBe(0);
		expect(meta(row).cascadeSignups).toBe(1);
	});

	it('adminCreateSignup registra slotId y name, sin teléfono ni correo', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const slot = await santisimo.createSlot(retreat.id, {
			startTime: inTwoHours(),
			endTime: inThreeHours(),
		});

		const saved = await santisimo.adminCreateSignup(retreat.id, {
			slotId: slot.id,
			name: 'María López',
			phone: '5512345678',
			email: 'maria@example.com',
		});

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'santisimo_signup.admin_create').length > 0,
		);
		const row = rowsOf(rows, 'santisimo_signup.admin_create')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(row.resourceId).toBe(saved.id);
		expect(JSON.parse(row.newValues!)).toMatchObject({ slotId: slot.id, name: 'María López' });
		expect(JSON.parse(row.newValues!)).not.toHaveProperty('phone');
		expect(JSON.parse(row.newValues!)).not.toHaveProperty('email');
		expect(meta(row)).toMatchObject({ hasPhone: true, hasEmail: true });
	});

	it('publicSignup deja UN evento agregado con la IP y cancelByToken cancela', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const slotA = await santisimo.createSlot(retreat.id, {
			startTime: inTwoHours(),
			endTime: inThreeHours(),
			capacity: 5,
		});
		const slotB = await santisimo.createSlot(retreat.id, {
			startTime: inThreeHours(),
			endTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
			capacity: 5,
		});

		const created = await santisimo.publicSignup(retreat.id, {
			slotIds: [slotA.id, slotB.id],
			name: 'Juan Pérez',
			ipAddress: '189.203.0.10',
		});
		expect(created).toHaveLength(2);

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'santisimo_signup.public_signup').length > 0,
		);
		const row = rowsOf(rows, 'santisimo_signup.public_signup')[0];
		expect(row.retreatId).toBe(retreat.id);
		// Ruta pública sin sesión: la IP viaja en el evento, el actor queda null.
		expect(row.actorUserId).toBeNull();
		expect(row.ipAddress).toBe('189.203.0.10');
		expect(meta(row)).toMatchObject({
			slotsCount: 2,
			name: 'Juan Pérez',
			hasPhone: false,
			hasEmail: false,
		});
		// La query devuelve los slots en orden de DB, no en el pedido: el
		// orden del array no es significativo.
		expect([...meta(row).slotIds].sort()).toEqual([slotA.id, slotB.id].sort());

		// Cancelación por token (enlace del correo): acción propia, token fuera.
		await santisimo.cancelByToken(created[0].cancelToken!);

		const after = await waitForLogs((r) => rowsOf(r, 'santisimo_signup.cancel').length > 0);
		const cancel = rowsOf(after, 'santisimo_signup.cancel')[0];
		expect(cancel.retreatId).toBe(retreat.id);
		expect(cancel.resourceId).toBe(created[0].id);
		expect(JSON.parse(cancel.oldValues!)).toMatchObject({ name: 'Juan Pérez' });
		expect(cancel.metadata).not.toContain(created[0].cancelToken);
	});
});
