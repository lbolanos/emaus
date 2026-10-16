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
