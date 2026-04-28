import { DataSource } from 'typeorm';
import { ServiceTeamType } from '@repo/types';
import { getRepositories } from '../utils/repositoryHelpers';
import { v4 as uuidv4 } from 'uuid';

// Mapping: responsibility name → service team type
const RESPONSIBILITY_TEAM_TYPE_MAP: Record<string, ServiceTeamType> = {
	'Música': ServiceTeamType.MUSICA,
	'Logistica': ServiceTeamType.LOGISTICA,
	'Comedor': ServiceTeamType.COCINA,
	'Snacks': ServiceTeamType.SNACKS,
	'Compras': ServiceTeamType.COMPRAS,
	'Transporte': ServiceTeamType.TRANSPORTE,
	'Salón': ServiceTeamType.SALON,
	'Cuartos': ServiceTeamType.CUARTOS,
	'Oración de Intercesión': ServiceTeamType.ORACION,
	'Continua': ServiceTeamType.CONTINUA,
	'Palanquero 1': ServiceTeamType.PALANCAS,
	'Palanquero 2': ServiceTeamType.PALANCAS,
	'Palanquero 3': ServiceTeamType.PALANCAS,
};

// Reverse mapping: service team type → responsibility name(s)
// For Palancas, always use "Palanquero 1" as the target
const TEAM_TYPE_RESPONSIBILITY_MAP: Record<string, string> = {
	[ServiceTeamType.MUSICA]: 'Música',
	[ServiceTeamType.LOGISTICA]: 'Logistica',
	[ServiceTeamType.COCINA]: 'Comedor',
	[ServiceTeamType.SNACKS]: 'Snacks',
	[ServiceTeamType.COMPRAS]: 'Compras',
	[ServiceTeamType.TRANSPORTE]: 'Transporte',
	[ServiceTeamType.SALON]: 'Salón',
	[ServiceTeamType.CUARTOS]: 'Cuartos',
	[ServiceTeamType.ORACION]: 'Oración de Intercesión',
	[ServiceTeamType.CONTINUA]: 'Continua',
	[ServiceTeamType.PALANCAS]: 'Palanquero 1',
};

let _syncing = false;

/**
 * After assigning/unassigning a participant on a responsibility,
 * sync the corresponding service team's leader.
 */
export const syncResponsibilityToTeam = async (
	responsibilityName: string,
	retreatId: string,
	participantId: string | null,
	dataSource?: DataSource,
) => {
	if (_syncing) return;

	const teamType = RESPONSIBILITY_TEAM_TYPE_MAP[responsibilityName];
	if (!teamType) return;

	_syncing = true;
	try {
		const repos = getRepositories(dataSource);
		const team = await repos.serviceTeam.findOne({
			where: { retreatId, teamType },
		});
		if (!team) return;

		if (participantId) {
			await repos.serviceTeam.update(team.id, { leaderId: participantId });
			const existing = await repos.serviceTeamMember.findOne({
				where: { serviceTeamId: team.id, participantId },
			});
			if (!existing) {
				const member = repos.serviceTeamMember.create({
					id: uuidv4(),
					serviceTeamId: team.id,
					participantId,
					role: 'líder',
				});
				await repos.serviceTeamMember.save(member);
			}
		} else {
			if (team.leaderId) {
				await repos.serviceTeam.update(team.id, { leaderId: null as any });
			}
		}
	} catch (err) {
		console.error('[leaderSync] Error syncing responsibility → team:', err);
	} finally {
		_syncing = false;
	}
};

/**
 * After assigning/unassigning a leader on a service team,
 * sync the corresponding responsibility's participant.
 */
export const syncTeamToResponsibility = async (
	teamType: string,
	retreatId: string,
	participantId: string | null,
	dataSource?: DataSource,
) => {
	if (_syncing) return;

	const responsibilityName = TEAM_TYPE_RESPONSIBILITY_MAP[teamType];
	if (!responsibilityName) return;

	_syncing = true;
	try {
		const repos = getRepositories(dataSource);

		const responsibility = await repos.responsability.findOne({
			where: { retreatId, name: responsibilityName },
		});
		if (!responsibility) return;

		if (participantId) {
			const participant = await repos.participant.findOne({ where: { id: participantId } });
			if (participant) {
				responsibility.participant = participant;
				responsibility.participantId = participantId;
				await repos.responsability.save(responsibility);
			}
		} else {
			if (responsibility.participantId) {
				await repos.responsability.update(responsibility.id, { participantId: null as any });
			}
		}
	} catch (err) {
		console.error('[leaderSync] Error syncing team → responsibility:', err);
	} finally {
		_syncing = false;
	}
};
