/**
 * AI Chat Service - Assignment Tools Pure Logic Tests
 *
 * Tests the business logic for table and bed assignment tools
 * added to the AI chatbot (Jessy). No DB or AI SDK dependencies.
 */

// ---- Extracted logic: table capacity validation ----

const MAX_WALKERS_PER_TABLE = 7;

interface TableData {
	id: string;
	name: string;
	retreatId: string;
	walkers: Array<{ id: string; firstName: string; lastName: string; type: string; isCancelled: boolean }>;
	lider?: { id: string; firstName: string; lastName: string } | null;
	colider1?: { id: string; firstName: string; lastName: string } | null;
	colider2?: { id: string; firstName: string; lastName: string } | null;
}

interface ParticipantData {
	id: string;
	firstName: string;
	lastName: string;
	type: string;
	isCancelled: boolean;
	tableId?: string | null;
}

interface BedData {
	id: string;
	roomNumber: string;
	bedNumber: string;
	floor: number;
	type: string;
	defaultUsage: string;
	retreatId: string;
	participantId: string | null;
}

// Validates if a walker can be assigned to a table
function validateWalkerTableAssignment(
	table: TableData,
	participant: ParticipantData,
): { valid: boolean; error?: string } {
	if (participant.type !== 'walker') {
		return { valid: false, error: 'El participante no es un caminante' };
	}
	if (participant.isCancelled) {
		return { valid: false, error: 'El participante está cancelado' };
	}
	if (table.walkers.length >= MAX_WALKERS_PER_TABLE) {
		return { valid: false, error: `La mesa ya tiene ${MAX_WALKERS_PER_TABLE} caminantes (máximo)` };
	}
	if (table.walkers.some((w) => w.id === participant.id)) {
		return { valid: false, error: 'El participante ya está en esta mesa' };
	}
	return { valid: true };
}

// Validates if a server can be assigned as leader
function validateLeaderAssignment(
	table: TableData,
	participant: ParticipantData,
	role: 'lider' | 'colider1' | 'colider2',
): { valid: boolean; error?: string } {
	if (participant.type !== 'server') {
		return { valid: false, error: 'El participante no es un servidor' };
	}
	if (participant.isCancelled) {
		return { valid: false, error: 'El participante está cancelado' };
	}
	const currentLeader = table[role];
	if (currentLeader) {
		return { valid: false, error: `El rol ${role} ya está asignado a ${currentLeader.firstName} ${currentLeader.lastName}` };
	}
	return { valid: true };
}

// Validates if a participant can be assigned to a bed
function validateBedAssignment(
	bed: BedData,
	participant: ParticipantData | null,
	allBeds: BedData[],
): { valid: boolean; error?: string; currentBedId?: string } {
	// Unassign case
	if (participant === null) {
		if (!bed.participantId) {
			return { valid: false, error: 'La cama ya está vacía' };
		}
		return { valid: true };
	}

	if (participant.isCancelled) {
		return { valid: false, error: 'El participante está cancelado' };
	}

	// Check if bed is already occupied by someone else
	if (bed.participantId && bed.participantId !== participant.id) {
		return { valid: false, error: 'La cama ya está asignada a otro participante' };
	}

	// Find if participant already has a bed in this retreat
	const currentBed = allBeds.find((b) => b.participantId === participant.id && b.retreatId === bed.retreatId);
	if (currentBed && currentBed.id === bed.id) {
		return { valid: false, error: 'El participante ya está en esta cama' };
	}

	return { valid: true, currentBedId: currentBed?.id };
}

// Validates move between tables
function validateTableMove(
	currentTable: TableData | null,
	newTable: TableData,
	participant: ParticipantData,
): { valid: boolean; error?: string } {
	if (participant.type !== 'walker') {
		return { valid: false, error: 'El participante no es un caminante' };
	}
	if (participant.isCancelled) {
		return { valid: false, error: 'El participante está cancelado' };
	}
	if (currentTable && !currentTable.walkers.some((w) => w.id === participant.id)) {
		return { valid: false, error: 'El participante no está en la mesa actual' };
	}
	if (newTable.walkers.length >= MAX_WALKERS_PER_TABLE) {
		return { valid: false, error: `La mesa destino ya tiene ${MAX_WALKERS_PER_TABLE} caminantes (máximo)` };
	}
	if (currentTable && currentTable.id === newTable.id) {
		return { valid: false, error: 'La mesa actual y la destino son la misma' };
	}
	return { valid: true };
}

// ---- Extracted logic: system prompt capabilities ----

function buildCapabilities(hasAssignmentTools: boolean): string[] {
	const base = [
		'Buscar participantes',
		'Listar participantes por tipo',
		'Ver detalles de retiros',
		'Consultar pagos',
		'Ver asignaciones de mesas',
		'Consultar inventario',
		'Ver responsabilidades',
		'Consultar palancas',
		'Consultar camas',
	];
	if (hasAssignmentTools) {
		base.push('Cambiar participantes de mesa');
		base.push('Cambiar participantes de cama');
	}
	return base;
}

// ============= TESTS =============

describe('AI Chat Assignment Tools - Pure Logic Tests', () => {
	// ---- Test Data ----
	const makeWalker = (id: string, name: string, cancelled = false): ParticipantData => ({
		id,
		firstName: name.split(' ')[0],
		lastName: name.split(' ')[1] || 'Test',
		type: 'walker',
		isCancelled: cancelled,
	});

	const makeServer = (id: string, name: string, cancelled = false): ParticipantData => ({
		id,
		firstName: name.split(' ')[0],
		lastName: name.split(' ')[1] || 'Test',
		type: 'server',
		isCancelled: cancelled,
	});

	const makeTable = (id: string, name: string, walkers: ParticipantData[] = [], lider: any = null): TableData => ({
		id,
		name,
		retreatId: 'retreat-1',
		walkers: walkers.map((w) => ({ ...w, type: w.type })),
		lider,
		colider1: null,
		colider2: null,
	});

	const makeBed = (id: string, room: string, bed: string, floor: number, participantId: string | null = null): BedData => ({
		id,
		roomNumber: room,
		bedNumber: bed,
		floor,
		type: 'normal',
		defaultUsage: 'caminante',
		retreatId: 'retreat-1',
		participantId,
	});

	// ---- Walker to Table Assignment ----
	describe('validateWalkerTableAssignment', () => {
		test('should allow assigning walker to empty table', () => {
			const table = makeTable('t1', 'Mesa 1');
			const walker = makeWalker('w1', 'Juan Perez');
			expect(validateWalkerTableAssignment(table, walker)).toEqual({ valid: true });
		});

		test('should allow assigning walker to table with space', () => {
			const walkers = Array.from({ length: 5 }, (_, i) => makeWalker(`w${i}`, `Walker ${i}`));
			const table = makeTable('t1', 'Mesa 1', walkers);
			const newWalker = makeWalker('w99', 'Nuevo Caminante');
			expect(validateWalkerTableAssignment(table, newWalker)).toEqual({ valid: true });
		});

		test('should reject when table is full (7 walkers)', () => {
			const walkers = Array.from({ length: 7 }, (_, i) => makeWalker(`w${i}`, `Walker ${i}`));
			const table = makeTable('t1', 'Mesa 1', walkers);
			const newWalker = makeWalker('w99', 'Nuevo Caminante');
			const result = validateWalkerTableAssignment(table, newWalker);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('7');
		});

		test('should reject server (not walker)', () => {
			const table = makeTable('t1', 'Mesa 1');
			const server = makeServer('s1', 'Pedro Lopez');
			const result = validateWalkerTableAssignment(table, server);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('no es un caminante');
		});

		test('should reject cancelled participant', () => {
			const table = makeTable('t1', 'Mesa 1');
			const walker = makeWalker('w1', 'Juan Perez', true);
			const result = validateWalkerTableAssignment(table, walker);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('cancelado');
		});

		test('should reject if walker already in table', () => {
			const walker = makeWalker('w1', 'Juan Perez');
			const table = makeTable('t1', 'Mesa 1', [walker]);
			const result = validateWalkerTableAssignment(table, walker);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('ya está en esta mesa');
		});
	});

	// ---- Leader Assignment ----
	describe('validateLeaderAssignment', () => {
		test('should allow assigning server as lider', () => {
			const table = makeTable('t1', 'Mesa 1');
			const server = makeServer('s1', 'Pedro Lopez');
			expect(validateLeaderAssignment(table, server, 'lider')).toEqual({ valid: true });
		});

		test('should allow assigning server as colider1', () => {
			const table = makeTable('t1', 'Mesa 1');
			const server = makeServer('s1', 'Pedro Lopez');
			expect(validateLeaderAssignment(table, server, 'colider1')).toEqual({ valid: true });
		});

		test('should allow assigning server as colider2', () => {
			const table = makeTable('t1', 'Mesa 1');
			const server = makeServer('s1', 'Pedro Lopez');
			expect(validateLeaderAssignment(table, server, 'colider2')).toEqual({ valid: true });
		});

		test('should reject walker as leader', () => {
			const table = makeTable('t1', 'Mesa 1');
			const walker = makeWalker('w1', 'Juan Perez');
			const result = validateLeaderAssignment(table, walker, 'lider');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('no es un servidor');
		});

		test('should reject cancelled server', () => {
			const table = makeTable('t1', 'Mesa 1');
			const server = makeServer('s1', 'Pedro Lopez', true);
			const result = validateLeaderAssignment(table, server, 'lider');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('cancelado');
		});

		test('should reject if role already taken', () => {
			const existingLeader = { id: 's0', firstName: 'Ana', lastName: 'Garcia' };
			const table = makeTable('t1', 'Mesa 1', [], existingLeader);
			const server = makeServer('s1', 'Pedro Lopez');
			const result = validateLeaderAssignment(table, server, 'lider');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('ya está asignado');
			expect(result.error).toContain('Ana Garcia');
		});
	});

	// ---- Bed Assignment ----
	describe('validateBedAssignment', () => {
		test('should allow assigning participant to empty bed', () => {
			const bed = makeBed('b1', '101', '1', 1);
			const walker = makeWalker('w1', 'Juan Perez');
			const result = validateBedAssignment(bed, walker, [bed]);
			expect(result.valid).toBe(true);
		});

		test('should reject if bed occupied by someone else', () => {
			const bed = makeBed('b1', '101', '1', 1, 'other-id');
			const walker = makeWalker('w1', 'Juan Perez');
			const result = validateBedAssignment(bed, walker, [bed]);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('ya está asignada');
		});

		test('should allow reassigning same participant to same bed', () => {
			const bed = makeBed('b1', '101', '1', 1, 'w1');
			const walker = makeWalker('w1', 'Juan Perez');
			const result = validateBedAssignment(bed, walker, [bed]);
			// Already in this bed
			expect(result.valid).toBe(false);
			expect(result.error).toContain('ya está en esta cama');
		});

		test('should reject cancelled participant', () => {
			const bed = makeBed('b1', '101', '1', 1);
			const walker = makeWalker('w1', 'Juan Perez', true);
			const result = validateBedAssignment(bed, walker, [bed]);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('cancelado');
		});

		test('should return currentBedId if participant has existing bed', () => {
			const currentBed = makeBed('b-old', '201', '1', 2, 'w1');
			const newBed = makeBed('b-new', '101', '1', 1);
			const walker = makeWalker('w1', 'Juan Perez');
			const result = validateBedAssignment(newBed, walker, [currentBed, newBed]);
			expect(result.valid).toBe(true);
			expect(result.currentBedId).toBe('b-old');
		});

		test('should allow unassigning (null participant)', () => {
			const bed = makeBed('b1', '101', '1', 1, 'w1');
			const result = validateBedAssignment(bed, null, [bed]);
			expect(result.valid).toBe(true);
		});

		test('should reject unassigning already empty bed', () => {
			const bed = makeBed('b1', '101', '1', 1, null);
			const result = validateBedAssignment(bed, null, [bed]);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('ya está vacía');
		});
	});

	// ---- Move Walker Between Tables ----
	describe('validateTableMove', () => {
		test('should allow moving walker to new table', () => {
			const walker = makeWalker('w1', 'Juan Perez');
			const currentTable = makeTable('t1', 'Mesa 1', [walker]);
			const newTable = makeTable('t2', 'Mesa 2');
			expect(validateTableMove(currentTable, newTable, walker)).toEqual({ valid: true });
		});

		test('should reject if destination table is full', () => {
			const walker = makeWalker('w1', 'Juan Perez');
			const currentTable = makeTable('t1', 'Mesa 1', [walker]);
			const fullWalkers = Array.from({ length: 7 }, (_, i) => makeWalker(`fw${i}`, `Full ${i}`));
			const fullTable = makeTable('t2', 'Mesa 2', fullWalkers);
			const result = validateTableMove(currentTable, fullTable, walker);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('7');
		});

		test('should reject moving to same table', () => {
			const walker = makeWalker('w1', 'Juan Perez');
			const table = makeTable('t1', 'Mesa 1', [walker]);
			const result = validateTableMove(table, table, walker);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('misma');
		});

		test('should reject if participant not in current table', () => {
			const walker = makeWalker('w1', 'Juan Perez');
			const currentTable = makeTable('t1', 'Mesa 1'); // walker not in this table
			const newTable = makeTable('t2', 'Mesa 2');
			const result = validateTableMove(currentTable, newTable, walker);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('no está en la mesa actual');
		});

		test('should reject cancelled participant', () => {
			const walker = makeWalker('w1', 'Juan Perez', true);
			const currentTable = makeTable('t1', 'Mesa 1', [walker]);
			const newTable = makeTable('t2', 'Mesa 2');
			const result = validateTableMove(currentTable, newTable, walker);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('cancelado');
		});

		test('should reject server (not walker)', () => {
			const server = makeServer('s1', 'Pedro Lopez');
			const currentTable = makeTable('t1', 'Mesa 1');
			const newTable = makeTable('t2', 'Mesa 2');
			const result = validateTableMove(currentTable, newTable, server);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('no es un caminante');
		});

		test('should allow move when current table is null (unassigned walker)', () => {
			const walker = makeWalker('w1', 'Juan Perez');
			const newTable = makeTable('t2', 'Mesa 2');
			expect(validateTableMove(null, newTable, walker)).toEqual({ valid: true });
		});
	});

	// ---- System Prompt Capabilities ----
	describe('buildCapabilities', () => {
		test('should include assignment capabilities when enabled', () => {
			const caps = buildCapabilities(true);
			expect(caps).toContain('Cambiar participantes de mesa');
			expect(caps).toContain('Cambiar participantes de cama');
		});

		test('should not include assignment capabilities when disabled', () => {
			const caps = buildCapabilities(false);
			expect(caps).not.toContain('Cambiar participantes de mesa');
			expect(caps).not.toContain('Cambiar participantes de cama');
		});

		test('should always include base capabilities', () => {
			const caps = buildCapabilities(false);
			expect(caps).toContain('Buscar participantes');
			expect(caps).toContain('Consultar pagos');
			expect(caps).toContain('Consultar camas');
			expect(caps.length).toBe(9);
		});

		test('should have 11 capabilities with assignments', () => {
			const caps = buildCapabilities(true);
			expect(caps.length).toBe(11);
		});
	});

	// ---- Cancelled Participant Filtering ----
	describe('Cancelled participant filtering', () => {
		const participants: ParticipantData[] = [
			makeWalker('w1', 'Juan Perez'),
			makeWalker('w2', 'Maria Lopez'),
			makeWalker('w3', 'Carlos Garcia', true), // cancelled
			makeServer('s1', 'Ana Ruiz'),
			makeServer('s2', 'Pedro Diaz', true), // cancelled
		];

		test('should filter out cancelled when isCancelled=false', () => {
			const active = participants.filter((p) => !p.isCancelled);
			expect(active).toHaveLength(3);
			expect(active.map((p) => p.id)).toEqual(['w1', 'w2', 's1']);
		});

		test('should include all when no filter', () => {
			expect(participants).toHaveLength(5);
		});

		test('should filter by type and cancelled status', () => {
			const activeWalkers = participants.filter((p) => p.type === 'walker' && !p.isCancelled);
			expect(activeWalkers).toHaveLength(2);
			expect(activeWalkers.map((p) => p.firstName)).toEqual(['Juan', 'Maria']);
		});
	});

	// ---- Edge Cases ----
	describe('Edge cases', () => {
		test('should handle table at exactly max capacity', () => {
			const walkers = Array.from({ length: MAX_WALKERS_PER_TABLE }, (_, i) => makeWalker(`w${i}`, `W ${i}`));
			const table = makeTable('t1', 'Mesa 1', walkers);
			expect(table.walkers.length).toBe(MAX_WALKERS_PER_TABLE);
			const newWalker = makeWalker('extra', 'Extra Walker');
			expect(validateWalkerTableAssignment(table, newWalker).valid).toBe(false);
		});

		test('should handle table at one below max capacity', () => {
			const walkers = Array.from({ length: MAX_WALKERS_PER_TABLE - 1 }, (_, i) => makeWalker(`w${i}`, `W ${i}`));
			const table = makeTable('t1', 'Mesa 1', walkers);
			const newWalker = makeWalker('extra', 'Extra Walker');
			expect(validateWalkerTableAssignment(table, newWalker).valid).toBe(true);
		});

		test('should handle bed assignment with multiple beds in retreat', () => {
			const beds = [
				makeBed('b1', '101', '1', 1, 'w1'),
				makeBed('b2', '101', '2', 1, null),
				makeBed('b3', '102', '1', 1, 'w2'),
				makeBed('b4', '102', '2', 1, null),
			];
			const walker = makeWalker('w1', 'Juan Perez');
			// Move w1 from b1 to b2
			const result = validateBedAssignment(beds[1], walker, beds);
			expect(result.valid).toBe(true);
			expect(result.currentBedId).toBe('b1');
		});

		test('MAX_WALKERS_PER_TABLE should be 7', () => {
			expect(MAX_WALKERS_PER_TABLE).toBe(7);
		});
	});
});
