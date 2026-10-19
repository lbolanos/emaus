import { describe, it, expect } from 'vitest';
import {
	replaceAssignmentsVariables,
	replaceAllVariables,
	findEmptyVariables,
	type AssignmentsData,
} from '@/utils/message';

const baseAssignments = (): AssignmentsData => ({
	responsibilities: [
		{ name: 'Música', typeLabel: 'Música' },
		{ name: 'Coordinación de cocina', typeLabel: 'Cocina', isLeadership: true },
	],
	teams: [
		{
			name: 'Música y Alabanza',
			role: 'Líder',
			leaderName: 'Juan Pérez',
			memberNames: ['María López', 'Carlos Gómez'],
		},
		{
			name: 'Cocina',
			role: 'Miembro',
			leaderName: 'Juan Pérez',
			memberNames: ['María López'],
		},
	],
});

describe('replaceAssignmentsVariables', () => {
	it('resolves counts and lists', () => {
		const out = replaceAssignmentsVariables(
			'{assignments.responsibilitiesCount} responsabilidades ({assignments.responsibilitiesList}) ' +
				'y {assignments.teamsCount} equipos ({assignments.teamsList})',
			baseAssignments(),
		);
		expect(out).toBe(
			'2 responsabilidades (Música, Coordinación de cocina) y 2 equipos (Música y Alabanza, Cocina)',
		);
	});

	it('builds the responsibilities roster in WhatsApp syntax (\\n + *bold*)', () => {
		const out = replaceAssignmentsVariables('{assignments.responsibilitiesRoster}', baseAssignments());
		const lines = out.split('\n');
		expect(lines).toHaveLength(2);
		// typeLabel equal to the name is not repeated; a different one is appended,
		// plus the leadership marker.
		expect(lines[0]).toBe('1. *Música*');
		expect(lines[1]).toBe('2. *Coordinación de cocina* — Cocina (liderazgo)');
	});

	it('builds the teams roster with role, leader and members', () => {
		const out = replaceAssignmentsVariables('{assignments.teamsRoster}', baseAssignments());
		expect(out).toContain('1. *Música y Alabanza* — Tu rol: Líder');
		expect(out).toContain('Líder: Juan Pérez');
		expect(out).toContain('Miembros: María López, Carlos Gómez');
		expect(out).toContain('2. *Cocina* — Tu rol: Miembro');
		// Teams are separated by a blank line; details are indented under the team.
		expect(out).toContain('\n\n');
	});

	it('renders explicit empty states when nothing is assigned', () => {
		const data: AssignmentsData = { responsibilities: [], teams: [] };
		const out = replaceAssignmentsVariables(
			'{assignments.responsibilitiesCount} | {assignments.responsibilitiesList} | ' +
				'{assignments.responsibilitiesRoster} || {assignments.teamsCount} | ' +
				'{assignments.teamsList} | {assignments.teamsRoster}',
			data,
		);
		expect(out).toBe(
			'0 | Ninguna | (sin responsabilidades asignadas) || 0 | Ninguno | (sin equipos asignados)',
		);
	});

	it('falls back to mock data when assignments is null (preview)', () => {
		const out = replaceAssignmentsVariables(
			'{assignments.responsibilitiesCount}/{assignments.teamsCount}',
			null,
		);
		expect(out).toBe('2/1');
	});

	it('survives dollar signs in values (function replacer)', () => {
		const data: AssignmentsData = {
			responsibilities: [{ name: 'Comprar $100 de café' }],
			teams: [],
		};
		const out = replaceAssignmentsVariables(
			'{assignments.responsibilitiesRoster} y $& literal',
			data,
		);
		expect(out).toBe('1. *Comprar $100 de café* y $& literal');
	});
});

describe('replaceAllVariables con scope assignments', () => {
	it('resolves {assignments.*} when the 9th argument is passed', () => {
		const out = replaceAllVariables(
			'Hola {participant.firstName}: {assignments.responsibilitiesCount} tareas en {assignments.teamsCount} equipos',
			{ firstName: 'Juan' } as any,
			null,
			undefined,
			undefined,
			undefined,
			false,
			undefined,
			baseAssignments(),
		);
		expect(out).toBe('Hola Juan: 2 tareas en 2 equipos');
	});

	it('keeps {assignments.*} literal when the argument is omitted', () => {
		const out = replaceAllVariables('{assignments.teamsRoster}', null, null);
		expect(out).toBe('{assignments.teamsRoster}');
	});
});

describe('findEmptyVariables con scope assignments', () => {
	const briefingMsg =
		'Tareas ({assignments.responsibilitiesCount}): {assignments.responsibilitiesRoster}';

	it('does NOT flag {assignments.*} without assignments context', () => {
		const empty = findEmptyVariables(briefingMsg, { firstName: 'X' } as any, null);
		expect(empty).not.toContain('assignments.responsibilitiesCount');
		expect(empty).not.toContain('assignments.responsibilitiesRoster');
	});

	it('does NOT flag {assignments.*} when the data is populated (empty states are content)', () => {
		const empty = findEmptyVariables(
			briefingMsg,
			{ firstName: 'X' } as any,
			null,
			undefined,
			undefined,
			undefined,
			baseAssignments(),
		);
		expect(empty).not.toContain('assignments.responsibilitiesCount');
		expect(empty).not.toContain('assignments.responsibilitiesRoster');
	});
});

// specs/assignment-documents (D5): moments and documents of the server.
describe('replaceAssignmentsVariables — moments and documents', () => {
	const pared = { label: 'Pared, lavado de manos y palancas', url: 'https://s3/pared.pdf' };
	const d1 = { label: 'Dinámica 1 (sábado)', url: 'https://s3/d1.pdf' };
	const d2 = { label: 'Dinámica 2 (domingo)', url: 'https://s3/d2.pdf' };
	const withDocuments = (): AssignmentsData => ({
		...baseAssignments(),
		moments: [
			{ dayLabel: 'Sábado', time: '14:40', name: 'Dinámica: Oración en Grupo', forTable: true, documents: [d1, d2] },
			{ dayLabel: 'Sábado', time: '20:15', name: 'Dinámica La Pared', documents: [pared] },
			// Same document as the Pared: its URL must not repeat.
			{ dayLabel: 'Sábado', time: '21:40', name: 'Dinámica: Lavado de Manos', documents: [pared] },
			{ dayLabel: 'Domingo', time: '15:00', name: 'Dinámica: Oración Compartida', forTable: true, documents: [d1, d2] },
		],
		responsibilityDocuments: [
			{ name: 'Reglamento de la Casa', documents: [{ label: 'Reglas para el retiro', url: 'https://s3/reglas.pdf' }] },
		],
		table: { name: 'Mesa 4', role: 'colíder' },
	});

	it('lists every moment, marking the table ones', () => {
		expect(replaceAssignmentsVariables('{assignments.momentsRoster}', withDocuments())).toBe(
			[
				'• Sábado 14:40 · Dinámica: Oración en Grupo (mesa)',
				'• Sábado 20:15 · Dinámica La Pared',
				'• Sábado 21:40 · Dinámica: Lavado de Manos',
				'• Domingo 15:00 · Dinámica: Oración Compartida (mesa)',
			].join('\n'),
		);
	});

	it('groups documents by moment, then responsibilities, table block last, each URL once', () => {
		const out = replaceAssignmentsVariables('{assignments.documentsRoster}', withDocuments());
		expect(out).toBe(
			[
				'*Sábado 20:15 · Dinámica La Pared*',
				'• Pared, lavado de manos y palancas: https://s3/pared.pdf',
				'',
				'*Reglamento de la Casa*',
				'• Reglas para el retiro: https://s3/reglas.pdf',
				'',
				'*Mesa 4 (colíder) · Dinámicas de mesa*',
				'Sábado 14:40 · Dinámica: Oración en Grupo',
				'Domingo 15:00 · Dinámica: Oración Compartida',
				'• Dinámica 1 (sábado): https://s3/d1.pdf',
				'• Dinámica 2 (domingo): https://s3/d2.pdf',
			].join('\n'),
		);
		expect(out.match(/https:\/\/s3\/pared\.pdf/g)).toHaveLength(1);
		expect(replaceAssignmentsVariables('{assignments.documentsCount}', withDocuments())).toBe('4');
	});

	it('renders explicit empty states without moments or documents', () => {
		const out = replaceAssignmentsVariables(
			'{assignments.momentsRoster}|{assignments.documentsRoster}|{assignments.documentsCount}',
			baseAssignments(),
		);
		expect(out).toBe('(sin momentos asignados en el Minuto a Minuto)|(sin documentos)|0');
	});

	it('the preview mock shows a moment and a table block', () => {
		const out = replaceAssignmentsVariables('{assignments.documentsRoster}', null);
		expect(out).toContain('*Viernes 20:57 · Explicación de las Palancas*');
		expect(out).toContain('*Mesa 3 (colíder) · Dinámicas de mesa*');
	});
});
