import { describe, it, expect } from 'vitest';
import { ResponsabilityType } from '@repo/types';
import { buildAssignmentsData } from '@/utils/serverAssignments';
import type { Responsability, ServiceTeam } from '@repo/types';

const makeResponsibility = (overrides: Partial<Responsability> = {}): Responsability =>
	({
		id: 'r-1',
		name: 'Música',
		responsabilityType: ResponsabilityType.MUSICA,
		isLeadership: false,
		priority: 0,
		isActive: true,
		retreatId: 'ret-1',
		participantId: 'p-1',
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}) as Responsability;

const makeTeam = (overrides: Partial<ServiceTeam> = {}): ServiceTeam =>
	({
		id: 'team-1',
		name: 'Música y Alabanza',
		teamType: 'musica',
		retreatId: 'ret-1',
		leaderId: null,
		leader: null,
		members: [],
		priority: 0,
		isActive: true,
		...overrides,
	}) as ServiceTeam;

describe('buildAssignmentsData', () => {
	it('collects the responsibilities of the participant with type labels and leadership flag', () => {
		const data = buildAssignmentsData(
			'p-1',
			[
				makeResponsibility({ id: 'r-1', name: 'Música', participantId: 'p-1' }),
				makeResponsibility({
					id: 'r-2',
					name: 'Coordinación de mesa',
					responsabilityType: ResponsabilityType.LIDER,
					isLeadership: true,
					participantId: 'p-1',
				}),
				// De otro servidor: no entra.
				makeResponsibility({ id: 'r-3', name: 'Cocina', responsabilityType: ResponsabilityType.COCINA, participantId: 'p-2' }),
			],
			[],
		);
		expect(data.responsibilities).toHaveLength(2);
		// Con igual prioridad, orden alfabético: 'Coordinación...' < 'Música'.
		expect(data.responsibilities[0]).toEqual({
			name: 'Coordinación de mesa',
			typeLabel: 'Liderazgo de mesa',
			isLeadership: true,
		});
		expect(data.responsibilities[1]).toEqual({
			name: 'Música',
			typeLabel: 'Música',
			isLeadership: false,
		});
	});

	it('sorts responsibilities by priority, then by name', () => {
		const data = buildAssignmentsData(
			'p-1',
			[
				makeResponsibility({ id: 'r-1', name: 'Zona de oración', priority: 0 }),
				makeResponsibility({ id: 'r-2', name: 'Altar', priority: 1 }),
				makeResponsibility({ id: 'r-3', name: 'Ambón', priority: 1 }),
			],
			[],
		);
		expect(data.responsibilities.map((r) => r.name)).toEqual([
			'Zona de oración',
			'Altar',
			'Ambón',
		]);
	});

	it('marks the participant as team leader or member (with textual role suffix)', () => {
		const data = buildAssignmentsData(
			'p-1',
			[],
			[
				makeTeam({
					id: 'team-1',
					leaderId: 'p-1',
					leader: { id: 'p-1', firstName: 'Ana', lastName: 'Líder' },
					members: [
						{ id: 'm-1', serviceTeamId: 'team-1', participantId: 'p-2', role: 'compras', participant: { id: 'p-2', firstName: 'Beto', lastName: 'Miembro' } },
					],
				}),
				makeTeam({
					id: 'team-2',
					name: 'Cocina',
					leaderId: 'p-9',
					members: [
						{ id: 'm-2', serviceTeamId: 'team-2', participantId: 'p-1', role: 'ayudante', participant: { id: 'p-1', firstName: 'Ana', lastName: 'Líder' } },
					],
				}),
			],
		);
		expect(data.teams).toHaveLength(2);
		const byName = Object.fromEntries(data.teams.map((t) => [t.name, t]));
		expect(byName['Música y Alabanza'].role).toBe('Líder');
		expect(byName['Cocina'].role).toBe('Miembro (ayudante)');
		// Miembro sin rol textual → 'Miembro' a secas (caso del equipo propio).
		const plain = buildAssignmentsData(
			'p-2',
			[],
			[makeTeam({ leaderId: 'p-1', members: [{ id: 'm-1', serviceTeamId: 'team-1', participantId: 'p-2', role: null }] })],
		);
		expect(plain.teams[0].role).toBe('Miembro');
	});

	it('excludes the leader from memberNames and prefers significant nicknames', () => {
		const data = buildAssignmentsData(
			'p-2',
			[],
			[
				makeTeam({
					leaderId: 'p-9',
					leader: { id: 'p-9', firstName: 'Lía', lastName: 'Líder', nickname: 'lili' },
					members: [
						// El líder también aparece como miembro: no debe duplicarse.
						{ id: 'm-0', serviceTeamId: 'team-1', participantId: 'p-9', participant: { id: 'p-9', firstName: 'Lía', lastName: 'Líder' } },
						{ id: 'm-1', serviceTeamId: 'team-1', participantId: 'p-2', participant: { id: 'p-2', firstName: 'Roberto', lastName: 'Nada', nickname: 'Tito' } },
						{ id: 'm-2', serviceTeamId: 'team-1', participantId: 'p-3', participant: { id: 'p-3', firstName: 'Sin', lastName: 'Participante' } },
					],
				}),
			],
		);
		expect(data.teams).toHaveLength(1);
		expect(data.teams[0].leaderName).toBe('lili');
		// 'Tito' (apodo significativo) y el nombre completo del que no tiene.
		expect(data.teams[0].memberNames).toEqual(['Tito', 'Sin Participante']);
	});

	it('skips inactive responsibilities and teams', () => {
		const data = buildAssignmentsData(
			'p-1',
			[makeResponsibility({ id: 'r-x', name: 'Vieja', isActive: false })],
			[makeTeam({ id: 'team-x', name: 'Viejo', isActive: false, leaderId: 'p-1' })],
		);
		expect(data.responsibilities).toHaveLength(0);
		expect(data.teams).toHaveLength(0);
	});

	it('returns an empty (valid) object for a participant without assignments', () => {
		const data = buildAssignmentsData('p-none', [makeResponsibility()], [makeTeam()]);
		expect(data).toEqual({ responsibilities: [], teams: [] });
	});
});
