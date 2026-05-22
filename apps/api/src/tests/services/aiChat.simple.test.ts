/**
 * AI Chat Service - Pure Logic Tests
 *
 * Tests the extracted business logic from aiChatService without DB or AI SDK dependencies.
 * Follows the same pattern as fieldMapping.simple.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---- Extracted logic: birthday date matching (string-based, timezone-safe) ----

const toYMD = (d: Date | string): string => {
	const s = typeof d === 'string' ? d : d.toISOString();
	return s.split('T')[0]; // "YYYY-MM-DD"
};

function filterBirthdays(
	startDate: string,
	endDate: string,
	participants: Array<{ birthDate: string | Date | null }>,
): number[] {
	const startMMDD = startDate.slice(5);
	const endMMDD = endDate.slice(5);
	const indices: number[] = [];
	participants.forEach((p, i) => {
		if (!p.birthDate) return;
		const birthStr = toYMD(p.birthDate);
		const birthMMDD = birthStr.slice(5);
		if (startMMDD <= endMMDD) {
			if (birthMMDD >= startMMDD && birthMMDD <= endMMDD) indices.push(i);
		} else {
			if (birthMMDD >= startMMDD || birthMMDD <= endMMDD) indices.push(i);
		}
	});
	return indices;
}

// ---- Extracted logic: snoring conflict detection ----

interface BedEntry {
	roomNumber: string;
	floor?: number;
	type: string;
	participant?: { firstName: string; lastName: string; snores: boolean; birthDate: string } | null;
}

function detectSnoringConflicts(beds: BedEntry[]) {
	const roomMap = new Map<string, { snorers: string[]; nonSnorers: string[] }>();
	for (const b of beds) {
		if (!b.participant) continue;
		const name = `${b.participant.firstName} ${b.participant.lastName}`;
		const key = `${b.floor ?? ''}-${b.roomNumber}`;
		if (!roomMap.has(key)) roomMap.set(key, { snorers: [], nonSnorers: [] });
		const room = roomMap.get(key)!;
		if (b.participant.snores) {
			room.snorers.push(name);
		} else {
			room.nonSnorers.push(name);
		}
	}
	return Array.from(roomMap.entries())
		.filter(([, r]) => r.snorers.length > 0 && r.nonSnorers.length > 0)
		.map(([key, r]) => ({ room: key, snorers: r.snorers, nonSnorers: r.nonSnorers }));
}

// ---- Extracted logic: age conflict detection (older people on upper bunks) ----

function getAge(birthDate: Date | string | null | undefined, now: Date = new Date()): number | null {
	if (!birthDate) return null;
	const birth = new Date(birthDate);
	let age = now.getFullYear() - birth.getFullYear();
	const m = now.getMonth() - birth.getMonth();
	if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
	return age;
}

function detectAgeConflicts(beds: BedEntry[], now: Date = new Date()) {
	const conflicts: { name: string; age: number; room: string }[] = [];
	for (const b of beds) {
		if (!b.participant) continue;
		const age = getAge(b.participant.birthDate, now);
		if (b.type === 'litera_arriba' && age !== null && age >= 50) {
			conflicts.push({
				name: `${b.participant.firstName} ${b.participant.lastName}`,
				age,
				room: b.roomNumber,
			});
		}
	}
	return conflicts;
}

// ---- Extracted logic: palancas filtering ----

interface PalancaParticipant {
	firstName: string;
	lastName: string;
	type: string;
	palancasReceived?: string | null;
	palancasRequested?: boolean | null;
	palancasCoordinator?: string | null;
}

function filterPalancas(participants: PalancaParticipant[]) {
	const walkers = participants.filter((p) => p.type === 'walker');
	const withPalancas = walkers.filter((p) => p.palancasReceived && p.palancasReceived.trim() !== '');
	const withoutPalancas = walkers.filter((p) => !p.palancasReceived || p.palancasReceived.trim() === '');
	const requested = walkers.filter((p) => p.palancasRequested);
	return { totalWalkers: walkers.length, withPalancas: withPalancas.length, withoutPalancas: withoutPalancas.length, requested: requested.length };
}

// ---- Extracted logic: fuzzy matching (community + inventory) ----
// Replica la lógica tokenizada que vive dentro de las tools del bot para que
// podamos testearla sin levantar BD ni AI SDK.

function normalizeForMatch(s: string): string {
	return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function tokenizeQuery(query: string): string[] {
	return normalizeForMatch(query.trim())
		.split(/\s+/)
		.filter((t) => t.length >= 2);
}

interface ScoredCandidate {
	score: number;
	matchType: 'phone' | 'email' | 'name';
}

function scoreNameMatch(query: string, haystack: string): number {
	const tokens = tokenizeQuery(query);
	if (tokens.length === 0) return 0;
	const norm = normalizeForMatch(haystack);
	const hits = tokens.filter((t) => norm.includes(t)).length;
	return hits / tokens.length;
}

function isPartialMatch(scores: number[]): boolean {
	const exact = scores.filter((s) => s === 1).length;
	const partial = scores.filter((s) => s >= 0.5 && s < 1).length;
	return exact === 0 && partial > 0;
}

function phoneLast10(s: string): string {
	return s.replace(/\D/g, '').slice(-10);
}

function phonesMatch(a: string, b: string): boolean {
	const lA = phoneLast10(a);
	const lB = phoneLast10(b);
	if (lA.length < 7 || lB.length < 7) return false;
	return lA === lB;
}

// ---- Extracted logic: isConfigured ----

function isConfigured(ai: { provider: string; anthropicApiKey?: string; googleApiKey?: string; openaiApiKey?: string }): boolean {
	switch (ai.provider) {
		case 'anthropic':
			return !!ai.anthropicApiKey;
		case 'google':
			return !!ai.googleApiKey;
		case 'openai':
			return !!ai.openaiApiKey;
		default:
			return false;
	}
}

// ============= TESTS =============

describe('AI Chat Service - Pure Logic Tests', () => {
	describe('Birthday During Retreat', () => {
		const participants = [
			{ birthDate: '1988-02-20' }, // Feb 20
			{ birthDate: '1990-02-15' }, // Feb 15
			{ birthDate: '1995-03-01' }, // Mar 1
			{ birthDate: '1985-02-13' }, // Feb 13
			{ birthDate: null },
			{ birthDate: '2000-12-30' }, // Dec 30
			{ birthDate: '1992-01-02' }, // Jan 2
		];

		test('should find birthdays within retreat date range', () => {
			const result = filterBirthdays('2026-02-13', '2026-02-22', participants);
			// Feb 13, 15, 20 are within range
			expect(result).toEqual([0, 1, 3]);
		});

		test('should exclude birthdays outside range', () => {
			const result = filterBirthdays('2026-02-13', '2026-02-22', participants);
			// Mar 1 (index 2) is outside, null (4) is skipped, Dec 30 (5) is outside, Jan 2 (6) is outside
			expect(result).not.toContain(2);
			expect(result).not.toContain(4);
			expect(result).not.toContain(5);
			expect(result).not.toContain(6);
		});

		test('should handle year boundary retreat (Dec-Jan)', () => {
			const result = filterBirthdays('2025-12-28', '2026-01-03', participants);
			// Dec 30 and Jan 2 should match
			expect(result).toEqual([5, 6]);
		});

		test('should handle single-day retreat', () => {
			const result = filterBirthdays('2026-02-20', '2026-02-20', participants);
			expect(result).toEqual([0]); // Only Feb 20
		});

		test('should skip participants with null birthDate', () => {
			const result = filterBirthdays('2026-01-01', '2026-12-31', participants);
			expect(result).not.toContain(4);
		});

		test('should handle Date objects as birthDate', () => {
			const withDateObj = [{ birthDate: new Date('1988-02-20T00:00:00Z') }];
			const result = filterBirthdays('2026-02-18', '2026-02-22', withDateObj);
			expect(result).toEqual([0]);
		});

		test('should include boundary dates (start and end)', () => {
			const result = filterBirthdays('2026-02-15', '2026-02-20', participants);
			expect(result).toContain(0); // Feb 20 (end boundary)
			expect(result).toContain(1); // Feb 15 (start boundary)
		});
	});

	describe('Snoring Conflict Detection', () => {
		test('should detect rooms with mixed snoring', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Juan', lastName: 'Perez', snores: true, birthDate: '1980-01-01' } },
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Pedro', lastName: 'Lopez', snores: false, birthDate: '1985-01-01' } },
			];
			const conflicts = detectSnoringConflicts(beds);
			expect(conflicts).toHaveLength(1);
			expect(conflicts[0].room).toBe('1-101');
			expect(conflicts[0].snorers).toEqual(['Juan Perez']);
			expect(conflicts[0].nonSnorers).toEqual(['Pedro Lopez']);
		});

		test('should not flag rooms where everyone snores', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Juan', lastName: 'A', snores: true, birthDate: '1980-01-01' } },
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Pedro', lastName: 'B', snores: true, birthDate: '1985-01-01' } },
			];
			const conflicts = detectSnoringConflicts(beds);
			expect(conflicts).toHaveLength(0);
		});

		test('should not flag rooms where nobody snores', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Juan', lastName: 'A', snores: false, birthDate: '1980-01-01' } },
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Pedro', lastName: 'B', snores: false, birthDate: '1985-01-01' } },
			];
			const conflicts = detectSnoringConflicts(beds);
			expect(conflicts).toHaveLength(0);
		});

		test('should skip unassigned beds', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Juan', lastName: 'A', snores: true, birthDate: '1980-01-01' } },
				{ roomNumber: '101', floor: 1, type: 'normal', participant: null },
			];
			const conflicts = detectSnoringConflicts(beds);
			expect(conflicts).toHaveLength(0); // Only one person, no conflict
		});

		test('should handle multiple rooms independently', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Juan', lastName: 'A', snores: true, birthDate: '1980-01-01' } },
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Pedro', lastName: 'B', snores: false, birthDate: '1985-01-01' } },
				{ roomNumber: '102', floor: 1, type: 'normal', participant: { firstName: 'Carlos', lastName: 'C', snores: true, birthDate: '1980-01-01' } },
				{ roomNumber: '102', floor: 1, type: 'normal', participant: { firstName: 'Luis', lastName: 'D', snores: true, birthDate: '1985-01-01' } },
			];
			const conflicts = detectSnoringConflicts(beds);
			expect(conflicts).toHaveLength(1); // Only room 101
			expect(conflicts[0].room).toBe('1-101');
		});
	});

	describe('Age Conflict Detection (Upper Bunk)', () => {
		const now = new Date('2026-03-07');

		test('should detect person 50+ on upper bunk', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_arriba', participant: { firstName: 'Maria', lastName: 'Garcia', snores: false, birthDate: '1970-06-15' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(1);
			expect(conflicts[0].name).toBe('Maria Garcia');
			expect(conflicts[0].age).toBe(55);
		});

		test('should not flag person under 50 on upper bunk', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_arriba', participant: { firstName: 'Ana', lastName: 'Lopez', snores: false, birthDate: '1990-01-01' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(0);
		});

		test('should not flag person 50+ on normal bed', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Maria', lastName: 'Garcia', snores: false, birthDate: '1970-06-15' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(0);
		});

		test('should not flag person 50+ on lower bunk', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_abajo', participant: { firstName: 'Maria', lastName: 'Garcia', snores: false, birthDate: '1970-06-15' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(0);
		});

		test('should skip unassigned beds', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_arriba', participant: null },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(0);
		});

		test('should detect exactly 50 years old', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_arriba', participant: { firstName: 'Rosa', lastName: 'M', snores: false, birthDate: '1976-03-07' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(1);
			expect(conflicts[0].age).toBe(50);
		});

		test('should not flag person turning 50 later this year', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_arriba', participant: { firstName: 'Rosa', lastName: 'M', snores: false, birthDate: '1976-12-01' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(0); // Still 49
		});
	});

	describe('Palancas Filtering', () => {
		const participants: PalancaParticipant[] = [
			{ firstName: 'Juan', lastName: 'A', type: 'walker', palancasReceived: 'carta de mama', palancasRequested: true, palancasCoordinator: 'Pedro' },
			{ firstName: 'Maria', lastName: 'B', type: 'walker', palancasReceived: null, palancasRequested: true, palancasCoordinator: 'Ana' },
			{ firstName: 'Carlos', lastName: 'C', type: 'walker', palancasReceived: '', palancasRequested: false, palancasCoordinator: null },
			{ firstName: 'Luis', lastName: 'D', type: 'server', palancasReceived: null, palancasRequested: false, palancasCoordinator: null },
			{ firstName: 'Ana', lastName: 'E', type: 'walker', palancasReceived: '  ', palancasRequested: false, palancasCoordinator: null },
		];

		test('should count only walkers', () => {
			const result = filterPalancas(participants);
			expect(result.totalWalkers).toBe(4); // Luis is server
		});

		test('should identify walkers with palancas', () => {
			const result = filterPalancas(participants);
			expect(result.withPalancas).toBe(1); // Only Juan
		});

		test('should identify walkers without palancas', () => {
			const result = filterPalancas(participants);
			expect(result.withoutPalancas).toBe(3); // Maria (null), Carlos (empty), Ana (whitespace)
		});

		test('should count requested palancas', () => {
			const result = filterPalancas(participants);
			expect(result.requested).toBe(2); // Juan and Maria
		});

		test('should treat whitespace-only as no palancas', () => {
			const result = filterPalancas(participants);
			// Ana has '  ' (whitespace only) - should count as withoutPalancas
			expect(result.withoutPalancas).toBe(3);
		});
	});

	describe('isConfigured', () => {
		test('should return true for anthropic with API key', () => {
			expect(isConfigured({ provider: 'anthropic', anthropicApiKey: 'sk-ant-123' })).toBe(true);
		});

		test('should return false for anthropic without API key', () => {
			expect(isConfigured({ provider: 'anthropic' })).toBe(false);
		});

		test('should return true for openai with API key', () => {
			expect(isConfigured({ provider: 'openai', openaiApiKey: 'sk-123' })).toBe(true);
		});

		test('should return false for openai without API key', () => {
			expect(isConfigured({ provider: 'openai' })).toBe(false);
		});

		test('should return true for google with API key', () => {
			expect(isConfigured({ provider: 'google', googleApiKey: 'gk-123' })).toBe(true);
		});

		test('should return false for google without API key', () => {
			expect(isConfigured({ provider: 'google' })).toBe(false);
		});

		test('should return false for unknown provider', () => {
			expect(isConfigured({ provider: 'unknown' })).toBe(false);
		});

		test('should return false for empty API key', () => {
			expect(isConfigured({ provider: 'anthropic', anthropicApiKey: '' })).toBe(false);
		});
	});

	describe('toYMD helper', () => {
		test('should extract YYYY-MM-DD from ISO string', () => {
			expect(toYMD('1988-02-20T00:00:00.000Z')).toBe('1988-02-20');
		});

		test('should keep plain date string as-is', () => {
			expect(toYMD('1988-02-20')).toBe('1988-02-20');
		});

		test('should convert Date object to YYYY-MM-DD', () => {
			expect(toYMD(new Date('1988-02-20T00:00:00Z'))).toBe('1988-02-20');
		});
	});

	describe('System prompt — Foto de lista de asistencia', () => {
		const source = fs.readFileSync(
			path.join(__dirname, '../../services/aiChatService.ts'),
			'utf8',
		);

		test('mentions the new capability in the capabilities list', () => {
			expect(source).toMatch(/Procesar fotos de listas de asistencia/);
		});

		test('contains the IMPORTANTE block for image handling', () => {
			expect(source).toMatch(/IMPORTANTE\s*[—-]\s*Foto de lista de asistencia/);
		});

		test('instructs the model to identify the community before mutating', () => {
			expect(source).toMatch(/getMyAdminCommunities/);
			expect(source).toMatch(/NUNCA asumas la comunidad/);
		});

		test('instructs the model to identify the meeting via listCommunityMeetings', () => {
			expect(source).toMatch(/listCommunityMeetings/);
		});

		test('requires a consolidated preview before mutating', () => {
			expect(source).toMatch(/preview/i);
			expect(source).toMatch(/Confirmas/);
		});

		test('uses pending_verification for new members from photo', () => {
			expect(source).toMatch(/pending_verification/);
			expect(source).toMatch(/Agregado desde foto de asistencia/);
		});

		test('subió stepCountIs para acomodar el flujo multi-paso', () => {
			expect(source).toMatch(/stepCountIs\(8\)/);
		});
	});

	describe('System prompt — Foto/audio de inventario', () => {
		const source = fs.readFileSync(
			path.join(__dirname, '../../services/aiChatService.ts'),
			'utf8',
		);

		test('lista la capacidad nueva de inventario', () => {
			expect(source).toMatch(/Registrar inventario desde foto o audio/);
		});

		test('incluye la sección IMPORTANTE para foto/audio de inventario', () => {
			expect(source).toMatch(/IMPORTANTE\s*[—-]\s*Foto o audio de inventario/);
		});

		test('instruye detectar intent snapshot vs incremento', () => {
			expect(source).toMatch(/snapshot/i);
			expect(source).toMatch(/incremento/i);
			expect(source).toMatch(/llegan|llegaron|agrega/i);
		});

		test('define las 3 tools nuevas de inventario', () => {
			expect(source).toMatch(/findInventoryItem:/);
			expect(source).toMatch(/updateInventoryQuantity:/);
			expect(source).toMatch(/addCustomInventoryItem:/);
		});

		test('siempre busca match en el inventario y muestra el resultado al usuario', () => {
			expect(source).toMatch(/SIEMPRE llama findInventoryItem/);
			expect(source).toMatch(/sin tomar decisi[óo]n autom[áa]tica|NO decidas t[úu]/);
		});

		test('cuando varios artículos matchean al mismo item genérico, pregunta antes de unificar', () => {
			expect(source).toMatch(/Marcadores y Plumas/); // ejemplo de nombre genérico
			expect(source).toMatch(/sumo todos a ese item.*ad-hoc separados/i);
		});

		test('exige enumerar cada producto distinto antes de matchear', () => {
			expect(source).toMatch(/DESCRIBE PRIMERO TODO LO QUE VES/);
			expect(source).toMatch(/marca\/color\/modelo distintos/);
		});
	});

	describe('Fuzzy matching — community y inventory', () => {
		describe('normalizeForMatch', () => {
			test('quita diacríticos', () => {
				expect(normalizeForMatch('Bolaños')).toBe('bolanos');
				expect(normalizeForMatch('René Solórzano')).toBe('rene solorzano');
				expect(normalizeForMatch('Pérez')).toBe('perez');
			});

			test('lowercase', () => {
				expect(normalizeForMatch('JORGE AVALOS')).toBe('jorge avalos');
			});
		});

		describe('tokenizeQuery', () => {
			test('separa por espacios y descarta tokens muy cortos', () => {
				expect(tokenizeQuery('Hector Bolaños')).toEqual(['hector', 'bolanos']);
				expect(tokenizeQuery('  Carlos   Ponzio  ')).toEqual(['carlos', 'ponzio']);
			});

			test('descarta tokens de 1 letra (preposiciones, iniciales)', () => {
				expect(tokenizeQuery('Juan de la Torre')).toEqual(['juan', 'de', 'la', 'torre']);
				// "a" sí se filtra (< 2), "de" y "la" pasan
			});

			test('query vacía produce array vacío', () => {
				expect(tokenizeQuery('')).toEqual([]);
				expect(tokenizeQuery('   ')).toEqual([]);
			});
		});

		describe('scoreNameMatch', () => {
			test('match perfecto da score 1', () => {
				const score = scoreNameMatch('Hector Bolaños', 'Hector Leonardo Bolanos Munoz');
				expect(score).toBe(1);
			});

			test('match parcial da score fraccionario', () => {
				// "Pedro Bolaños": pedro NO está, bolanos SÍ → 1/2 = 0.5
				const score = scoreNameMatch('Pedro Bolaños', 'Hector Leonardo Bolanos');
				expect(score).toBe(0.5);
			});

			test('un solo apellido matchea contra nombre completo (score 1)', () => {
				const score = scoreNameMatch('Bolaños', 'Hector Leonardo Bolanos Munoz');
				expect(score).toBe(1);
			});

			test('orden invertido (apellido primero) sigue matcheando', () => {
				const score = scoreNameMatch('Bolaños Hector', 'Hector Leonardo Bolanos Munoz');
				expect(score).toBe(1);
			});

			test('sin coincidencia da score 0', () => {
				const score = scoreNameMatch('Pedro Ramirez', 'Hector Bolanos');
				expect(score).toBe(0);
			});

			test('case-insensitive y sin acentos', () => {
				const score = scoreNameMatch('RENÉ SOLÓRZANO', 'rene solorzano mercado');
				expect(score).toBe(1);
			});
		});

		describe('isPartialMatch', () => {
			test('true cuando solo hay matches parciales (≥0.5 y <1)', () => {
				expect(isPartialMatch([0.5, 0.7])).toBe(true);
			});

			test('false si hay al menos un match exacto (score=1)', () => {
				expect(isPartialMatch([1, 0.5])).toBe(false);
			});

			test('false si solo hay scores bajos (<0.5)', () => {
				expect(isPartialMatch([0.3, 0.4])).toBe(false);
			});

			test('false si no hay candidatos', () => {
				expect(isPartialMatch([])).toBe(false);
			});
		});

		describe('phonesMatch (últimos 10 dígitos)', () => {
			test('mismos 10 dígitos con formato distinto matchean', () => {
				expect(phonesMatch('+52 55 1234 5678', '5512345678')).toBe(true);
				expect(phonesMatch('(55) 1234-5678', '5512345678')).toBe(true);
				expect(phonesMatch('+1 555 123 4567', '5551234567')).toBe(true);
			});

			test('teléfonos distintos no matchean', () => {
				expect(phonesMatch('5512345678', '5511112222')).toBe(false);
			});

			test('teléfonos muy cortos (<7 dígitos) no matchean', () => {
				expect(phonesMatch('123', '123')).toBe(false);
			});

			test('un teléfono vacío no matchea', () => {
				expect(phonesMatch('', '5512345678')).toBe(false);
				expect(phonesMatch('5512345678', '')).toBe(false);
			});

			test('mismo número aun con +52 implícito (último 10 igual)', () => {
				// Caso real: prefijo +52 vs sin prefijo, mismos 10 dígitos
				expect(phonesMatch('5215511406973', '5511406973')).toBe(true);
			});
		});

		describe('escenarios reales del bot (asistencia / inventario)', () => {
			test("Hector Bolaños matchea contra 'Hector Leonardo Bolanos Munoz' (caso real)", () => {
				expect(scoreNameMatch('Hector Bolaños', 'Hector Leonardo Bolanos Munoz')).toBe(1);
			});

			test("'Plumas' matchea con 'Marcadores y Plumas' del catálogo (item genérico)", () => {
				// El bot detecta el match aunque sea parcial — el prompt manda
				// preguntar al usuario antes de unificar.
				expect(scoreNameMatch('Plumas', 'Marcadores y Plumas')).toBe(1);
			});

			test("'Bolígrafo Bic azul' NO matchea perfecto con 'Marcadores y Plumas' (score parcial)", () => {
				// El nombre específico tiene 3 tokens; el genérico solo cubre 0 → score 0
				const score = scoreNameMatch('Bolígrafo Bic azul', 'Marcadores y Plumas');
				expect(score).toBe(0);
			});

			test("Maria López matchea con 'Mario Amado López López' (apellido único compartido)", () => {
				// Real: el bot encontró match cuando solo el apellido coincidía
				const score = scoreNameMatch('Maria Lopez', 'Mario Amado López López');
				// "maria" NO está, "lopez" SÍ → 1/2 = 0.5 (partial match)
				expect(score).toBe(0.5);
			});
		});
	});

	describe('getAge helper', () => {
		const now = new Date('2026-03-07');

		test('should calculate age correctly', () => {
			expect(getAge('1988-02-20', now)).toBe(38);
		});

		test('should handle birthday not yet passed this year', () => {
			expect(getAge('1988-12-20', now)).toBe(37);
		});

		test('should handle birthday today', () => {
			expect(getAge('1988-03-07', now)).toBe(38);
		});

		test('should return null for null birthDate', () => {
			expect(getAge(null)).toBeNull();
		});

		test('should return null for undefined birthDate', () => {
			expect(getAge(undefined)).toBeNull();
		});
	});
});
