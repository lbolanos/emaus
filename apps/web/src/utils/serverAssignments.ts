import type { Responsability, ServiceTeam } from '@repo/types';
import { RESPONSABILITY_TYPE_LABELS } from '@repo/types';
import { participantLabel } from '@/utils/participant';
import type { AssignmentsData } from '@/utils/message';

/**
 * Construye el `AssignmentsData` (responsabilidades + equipos de servicio) para
 * el briefing de tareas de un servidor, a partir de los datos que la vista de
 * Responsabilidades ya tiene cargados (`GET /responsabilities` +
 * `GET /service-teams/retreat`). Compartido con el envío asistido por
 * MessageDialog; el motor de secuencias tiene su propio espejo backend.
 *
 * Las responsabilidades filtran por `participantId` (1 responsable por fila);
 * los equipos por `leaderId` (rol 'Líder') o membresía (rol 'Miembro', con el
 * rol textual del miembro como sufijo cuando existe).
 */
export function buildAssignmentsData(
	participantId: string,
	responsibilities: Responsability[],
	teams: ServiceTeam[],
): AssignmentsData {
	const myResponsibilities = responsibilities
		.filter((r) => r.participantId === participantId && r.isActive !== false)
		.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.name.localeCompare(b.name))
		.map((r) => ({
			name: r.name,
			typeLabel: RESPONSABILITY_TYPE_LABELS[r.responsabilityType],
			isLeadership: !!r.isLeadership,
		}));

	const myTeams = teams
		.filter((t) => t.isActive !== false)
		.filter(
			(t) =>
				t.leaderId === participantId ||
				(t.members || []).some((m) => m.participantId === participantId),
		)
		.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.name.localeCompare(b.name))
		.map((t) => {
			const isLeader = t.leaderId === participantId;
			const membership = (t.members || []).find((m) => m.participantId === participantId);
			const role = isLeader
				? 'Líder'
				: membership?.role?.trim()
					? `Miembro (${membership.role.trim()})`
					: 'Miembro';
			// Roster del equipo: el líder va aparte; los miembros con el líder
			// excluido para no duplicarlo.
			const memberNames = (t.members || [])
				.filter((m) => m.participantId !== t.leaderId)
				.map((m) => participantLabel(m.participant))
				.filter(Boolean);
			return {
				name: t.name,
				role,
				leaderName: participantLabel(t.leader) || undefined,
				memberNames,
			};
		});

	return { responsibilities: myResponsibilities, teams: myTeams };
}
