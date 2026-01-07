import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Responsability } from '../entities/responsability.entity';
import { Retreat } from '../entities/retreat.entity';
import { Participant } from '../entities/participant.entity';
import { getRepositories } from '../utils/repositoryHelpers';
import { v4 as uuidv4 } from 'uuid';

export const findAllResponsibilities = async (retreatId?: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	const where = retreatId ? { retreatId } : {};
	return (
		repos.responsability?.find({
			where,
			relations: ['retreat', 'participant'],
		}) || []
	);
};

export const findResponsabilityById = async (id: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	return repos.responsability.findOne({
		where: { id },
		relations: ['retreat', 'participant'],
	});
};

export const createResponsability = async (
	responsabilityData: {
		name: string;
		description?: string;
		retreatId: string;
	},
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const newResponsability = repos.responsability.create({
		...responsabilityData,
		id: uuidv4(),
	});
	return repos.responsability.save(newResponsability);
};

export const updateResponsability = async (
	id: string,
	responsabilityData: Partial<{ name: string; description?: string }>,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const responsability = await repos.responsability.findOne({ where: { id } });
	if (!responsability) return null;
	Object.assign(responsability, responsabilityData);
	return repos.responsability.save(responsability);
};

export const deleteResponsability = async (id: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	await repos.responsability.delete(id);
};

export const assignResponsabilityToParticipant = async (
	responsabilityId: string,
	participantId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	const responsability = await repos.responsability.findOne({
		where: { id: responsabilityId },
		relations: ['participant'],
	});
	const participant = await repos.participant.findOne({ where: { id: participantId } });

	if (!responsability || !participant) return null;

	responsability.participant = participant;
	return repos.responsability.save(responsability);
};

export const removeResponsabilityFromParticipant = async (
	responsabilityId: string,
	participantId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const responsability = await repos.responsability.findOne({
		where: { id: responsabilityId },
		relations: ['participant'],
	});

	if (!responsability || responsability.participantId !== participantId) return null;

	responsability.participant = undefined;
	responsability.participantId = undefined;
	return repos.responsability.save(responsability);
};

export const getResponsibilitiesForParticipant = async (
	participantId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	return repos.responsability.find({
		where: { participantId },
		relations: ['retreat'],
	});
};

export const getParticipantsForResponsability = async (
	responsabilityId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const responsability = await repos.responsability.findOne({
		where: { id: responsabilityId },
		relations: ['participant'],
	});
	return responsability?.participant ? [responsability.participant] : [];
};

export const createDefaultResponsibilitiesForRetreat = async (
	retreat: Retreat,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const defaultResponsibilities = [
		'Palanquero 1',
		'Palanquero 2',
		'Palanquero 3',
		'Logistica',
		'Inventario',
		'Tesorero',
		'Sacerdotes',
		'Mantelitos',
		'Snacks',
		'Compras',
		'Transporte',
		'Música',
		'Comedor',
		'Salón',
		'Cuartos',
		'Oración',
		'Palanquitas',
		'Santísmo',
		'Campanero',
		'Continua',
	];

	const responsibilities = defaultResponsibilities.map((name) =>
		repos.responsability.create({
			id: uuidv4(),
			name,
			retreatId: retreat.id,
			retreat,
		}),
	);

	return repos.responsability.save(responsibilities);
};
