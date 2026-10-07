import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { updateParticipant } from '@/services/participantService';
import { Participant } from '@/entities/participant.entity';

/**
 * Guard de escritura del coordinador de palancas.
 *
 * `palancasCoordinator` se matchea VERBATIM ('Palanquero 1|2|3') en
 * messageSequenceService (PALANQUERO_NEW_WALKER): texto libre escrito por un
 * cliente sin select rompe esa notificación en silencio. El guard rechaza
 * valores NUEVOS inválidos, pero dejar pasar el valor YA ALMACENADO — el
 * formulario reenvía la ficha completa por spread y hay filas legacy con
 * prosa en la columna (backfill de importaciones de Excel). Las
 * importaciones (columna 'palancasencargado', texto libre) van exentas vía
 * isImporting.
 */
describe('palancas: guard del coordinador', () => {
	let retreatId: string;
	let participantId: string;

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		const retreat = await TestDataFactory.createTestRetreat();
		retreatId = retreat.id;
		const p = await TestDataFactory.createTestParticipant(retreatId, { type: 'walker' } as any);
		participantId = p.id;
	});

	const setCoordinator = async (palancasCoordinator: string | null) =>
		AppDataSource.getRepository(RetreatParticipant).update(
			{ participantId, retreatId },
			{ palancasCoordinator },
		);

	const readCoordinator = async () => {
		const rp = await AppDataSource.getRepository(RetreatParticipant).findOne({
			where: { participantId, retreatId },
		});
		return rp?.palancasCoordinator ?? null;
	};

	/** La ficha como la tiene el formulario: participant + campos per-retiro hidratados. */
	const fromList = async () => {
		const p = await AppDataSource.getRepository(Participant).findOne({
			where: { id: participantId },
		});
		return { ...p, palancasCoordinator: await readCoordinator() } as any;
	};

	it('reenviar el valor legacy almacenado pasa y lo preserva', async () => {
		await setCoordinator('Mamá de Ana');
		const ficha = await fromList();
		// El spread del formulario reenvía la prosa tal cual: no puede dar 400.
		expect(ficha.palancasCoordinator).toBe('Mamá de Ana');

		await updateParticipant(participantId, { ...ficha, cellPhone: '5551112233' } as any);

		expect(await readCoordinator()).toBe('Mamá de Ana');
	});

	it('un valor NUEVO inválido se rechaza con code y mensaje accionable', async () => {
		const ficha = await fromList();

		await expect(
			updateParticipant(participantId, { ...ficha, palancasCoordinator: 'El papá' } as any),
		).rejects.toMatchObject({
			code: 'INVALID_PALANQUERO_COORDINATOR',
			message: expect.stringContaining('Palanquero 1'),
		});

		// Nada se guardó.
		expect(await readCoordinator()).toBeNull();
	});

	it('cambiar la basura legacy por otra basura también se rechaza', async () => {
		await setCoordinator('Mamá de Ana');
		const ficha = await fromList();

		await expect(
			updateParticipant(participantId, { ...ficha, palancasCoordinator: 'El papá' } as any),
		).rejects.toMatchObject({ code: 'INVALID_PALANQUERO_COORDINATOR' });
	});

	it("'Palanquero 2' guarda", async () => {
		const ficha = await fromList();
		await updateParticipant(participantId, { ...ficha, palancasCoordinator: 'Palanquero 2' } as any);
		expect(await readCoordinator()).toBe('Palanquero 2');
	});

	it('limpiar con null o cadena vacía pasa sin throw', async () => {
		await setCoordinator('Palanquero 1');
		let ficha = await fromList();

		await updateParticipant(participantId, { ...ficha, palancasCoordinator: null } as any);
		expect(await readCoordinator()).toBeNull();

		await setCoordinator('Palanquero 1');
		ficha = await fromList();
		// El write site normaliza '' a null (palancasCoordinator || null).
		await updateParticipant(participantId, { ...ficha, palancasCoordinator: '' } as any);
		expect(await readCoordinator()).toBeNull();
	});

	it('la importación (isImporting) queda exenta: texto libre pasa', async () => {
		const ficha = await fromList();
		await updateParticipant(
			participantId,
			{ ...ficha, palancasCoordinator: 'La madrina' } as any,
			false, // skipRebalance
			true, // isImporting (columna Excel 'palancasencargado')
		);
		expect(await readCoordinator()).toBe('La madrina');
	});

	it('undefined no toca el valor almacenado', async () => {
		await setCoordinator('Palanquero 3');
		const ficha = await fromList();
		delete ficha.palancasCoordinator;

		await updateParticipant(participantId, { ...ficha, cellPhone: '5551112233' } as any);

		expect(await readCoordinator()).toBe('Palanquero 3');
	});
});
