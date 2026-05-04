// Mirror puro de la regla agregada en updateParticipant
// (apps/api/src/services/participantService.ts):
//
//   Cuando un participante se marca como partial_server (angelito) se libera
//   de mesa (rp.tableId = null) y de cama (RetreatBed.participantId = null
//   para todas las camas del retiro asignadas a ese participante).
//
// Replicamos la lógica de decisión sin tocar TypeORM para que el test corra
// sin la patching del data-source, igual que el resto de *.simple.test.ts.

type RpUpdate = { tableId?: string | null; type?: string; isCancelled?: boolean };

interface Inputs {
	type?: string | null; // nuevo type que llega en el patch
	isCancelled?: boolean | null;
	wasCancelled: boolean;
}

interface Outputs {
	rpUpdates: RpUpdate;
	clearBedFor: 'this-participant' | null;
}

/**
 * Espejo del bloque de decisiones dentro de `updateParticipant` que decide:
 *  - qué campos se escriben en retreat_participants
 *  - si hay que limpiar la cama (RetreatBed.participantId = null) para este participante
 *
 * Reglas:
 *  - Si pasa de no-cancelado a cancelado: tableId = null + limpiar cama.
 *  - Si type === 'partial_server': tableId = null + limpiar cama (idempotente).
 *  - Otros campos se pasan tal cual.
 */
function decide(inputs: Inputs): Outputs {
	const rpUpdates: RpUpdate = {};
	let clearBedFor: 'this-participant' | null = null;

	if (inputs.type !== undefined && inputs.type !== null) rpUpdates.type = inputs.type;
	if (inputs.isCancelled !== undefined && inputs.isCancelled !== null)
		rpUpdates.isCancelled = inputs.isCancelled;

	const isCancelling = inputs.isCancelled === true && !inputs.wasCancelled;
	if (isCancelling) {
		rpUpdates.tableId = null;
		clearBedFor = 'this-participant';
	}

	if (inputs.type === 'partial_server') {
		rpUpdates.tableId = null;
		clearBedFor = 'this-participant';
	}

	return { rpUpdates, clearBedFor };
}

describe('updateParticipant — al marcar como partial_server libera mesa y cama', () => {
	test('type=partial_server fija tableId=null y manda limpiar cama', () => {
		const out = decide({ type: 'partial_server', wasCancelled: false });
		expect(out.rpUpdates.tableId).toBeNull();
		expect(out.rpUpdates.type).toBe('partial_server');
		expect(out.clearBedFor).toBe('this-participant');
	});

	test('type=server no toca mesa ni cama', () => {
		const out = decide({ type: 'server', wasCancelled: false });
		expect(out.rpUpdates.tableId).toBeUndefined();
		expect(out.clearBedFor).toBeNull();
	});

	test('type=walker no toca mesa ni cama', () => {
		const out = decide({ type: 'walker', wasCancelled: false });
		expect(out.rpUpdates.tableId).toBeUndefined();
		expect(out.clearBedFor).toBeNull();
	});

	test('idempotente: ya era partial_server, vuelve a aplicar limpieza', () => {
		const out = decide({ type: 'partial_server', wasCancelled: false });
		expect(out.rpUpdates.tableId).toBeNull();
		expect(out.clearBedFor).toBe('this-participant');
	});

	test('cancelar (isCancelled true, wasCancelled false) limpia mesa y cama', () => {
		const out = decide({ isCancelled: true, wasCancelled: false });
		expect(out.rpUpdates.tableId).toBeNull();
		expect(out.clearBedFor).toBe('this-participant');
	});

	test('cancelar de nuevo (ya estaba cancelado) NO re-limpia (no cambia state)', () => {
		const out = decide({ isCancelled: true, wasCancelled: true });
		expect(out.rpUpdates.tableId).toBeUndefined();
		expect(out.clearBedFor).toBeNull();
	});

	test('combo: pasar a partial_server y cancelar a la vez también limpia', () => {
		const out = decide({
			type: 'partial_server',
			isCancelled: true,
			wasCancelled: false,
		});
		expect(out.rpUpdates.tableId).toBeNull();
		expect(out.rpUpdates.type).toBe('partial_server');
		expect(out.rpUpdates.isCancelled).toBe(true);
		expect(out.clearBedFor).toBe('this-participant');
	});

	test('actualizar sin cambios de type/isCancelled no toca mesa ni cama', () => {
		const out = decide({ wasCancelled: false });
		expect(out.rpUpdates.tableId).toBeUndefined();
		expect(out.clearBedFor).toBeNull();
	});
});
