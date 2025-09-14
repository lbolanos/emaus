import { AppDataSource } from '../data-source';
import { Responsability } from '../entities/responsability.entity';
import { Retreat } from '../entities/retreat.entity';
import { Participant } from '../entities/participant.entity';
import { v4 as uuidv4 } from 'uuid';

const responsabilityRepository = AppDataSource.getRepository(Responsability);

export const findAllResponsibilities = async (retreatId?: string) => {
	const where = retreatId ? { retreatId } : {};
	return responsabilityRepository.find({
		where,
		relations: ['retreat', 'participant'],
	});
};

export const findResponsabilityById = async (id: string) => {
	return responsabilityRepository.findOne({
		where: { id },
		relations: ['retreat', 'participant'],
	});
};

export const createResponsability = async (responsabilityData: {
	name: string;
	description?: string;
	retreatId: string;
}) => {
	const newResponsability = responsabilityRepository.create({
		...responsabilityData,
		id: uuidv4(),
	});
	return responsabilityRepository.save(newResponsability);
};

export const updateResponsability = async (
	id: string,
	responsabilityData: Partial<{ name: string; description?: string }>,
) => {
	const responsability = await responsabilityRepository.findOne({ where: { id } });
	if (!responsability) return null;
	Object.assign(responsability, responsabilityData);
	return responsabilityRepository.save(responsability);
};

export const deleteResponsability = async (id: string) => {
	await responsabilityRepository.delete(id);
};

export const assignResponsabilityToParticipant = async (
	responsabilityId: string,
	participantId: string,
) => {
	const responsabilityRepository = AppDataSource.getRepository(Responsability);
	const participantRepository = AppDataSource.getRepository(Participant);

	const responsability = await responsabilityRepository.findOne({
		where: { id: responsabilityId },
		relations: ['participant'],
	});
	const participant = await participantRepository.findOne({ where: { id: participantId } });

	if (!responsability || !participant) return null;

	responsability.participant = participant;
	return responsabilityRepository.save(responsability);
};

export const removeResponsabilityFromParticipant = async (
	responsabilityId: string,
	participantId: string,
) => {
	const responsability = await responsabilityRepository.findOne({
		where: { id: responsabilityId },
		relations: ['participant'],
	});

	if (!responsability || responsability.participantId !== participantId) return null;

	responsability.participant = undefined;
	responsability.participantId = undefined;
	return responsabilityRepository.save(responsability);
};

export const getResponsibilitiesForParticipant = async (participantId: string) => {
	return responsabilityRepository.find({
		where: { participantId },
		relations: ['retreat'],
	});
};

export const getParticipantsForResponsability = async (responsabilityId: string) => {
	const repository = AppDataSource.getRepository(Responsability);
	const responsability = await repository.findOne({
		where: { id: responsabilityId },
		relations: ['participant'],
	});
	return responsability?.participant ? [responsability.participant] : [];
};

export const createDefaultResponsibilitiesForRetreat = async (retreat: Retreat) => {
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
		responsabilityRepository.create({
			id: uuidv4(),
			name,
			retreatId: retreat.id,
			retreat,
		}),
	);

	return responsabilityRepository.save(responsibilities);
};
