import { AppDataSource } from '../data-source';
import { Charge } from '../entities/charge.entity';
import { Retreat } from '../entities/retreat.entity';
import { Participant } from '../entities/participant.entity';
import { v4 as uuidv4 } from 'uuid';

const chargeRepository = AppDataSource.getRepository(Charge);

export const findAllCharges = async (retreatId?: string) => {
  const where = retreatId ? { retreatId } : {};
  return chargeRepository.find({
    where,
    relations: ['retreat', 'participant'],
  });
};

export const findChargeById = async (id: string) => {
  return chargeRepository.findOne({
    where: { id },
    relations: ['retreat', 'participant'],
  });
};

export const createCharge = async (chargeData: {
  name: string;
  description?: string;
  retreatId: string;
}) => {
  const newCharge = chargeRepository.create({
    ...chargeData,
    id: uuidv4(),
  });
  return chargeRepository.save(newCharge);
};

export const updateCharge = async (
  id: string,
  chargeData: Partial<{ name: string; description?: string }>
) => {
  const charge = await chargeRepository.findOne({ where: { id } });
  if (!charge) return null;
  Object.assign(charge, chargeData);
  return chargeRepository.save(charge);
};

export const deleteCharge = async (id: string) => {
  await chargeRepository.delete(id);
};

export const assignChargeToParticipant = async (chargeId: string, participantId: string) => {
  const chargeRepository = AppDataSource.getRepository(Charge);
  const participantRepository = AppDataSource.getRepository(Participant);

  const charge = await chargeRepository.findOne({
    where: { id: chargeId },
    relations: ['participant'],
  });
  const participant = await participantRepository.findOne({ where: { id: participantId } });

  if (!charge || !participant) return null;

  charge.participant = participant;
  return chargeRepository.save(charge);
};

export const removeChargeFromParticipant = async (chargeId: string, participantId: string) => {
  const charge = await chargeRepository.findOne({
    where: { id: chargeId },
    relations: ['participant'],
  });

  if (!charge || charge.participantId !== participantId) return null;

  charge.participant = undefined;
  charge.participantId = undefined;
  return chargeRepository.save(charge);
};

export const getChargesForParticipant = async (participantId: string) => {
  return chargeRepository.find({
    where: { participantId },
    relations: ['retreat'],
  });
};

export const getParticipantsForCharge = async (chargeId: string) => {
  const repository = AppDataSource.getRepository(Charge);
  const charge = await repository.findOne({
    where: { id: chargeId },
    relations: ['participant'],
  });
  return charge?.participant ? [charge.participant] : [];
};

export const createDefaultChargesForRetreat = async (retreat: Retreat) => {
  const defaultCharges = [
    'Palancas 1',
    'Palancas 2',
    'Palancas 3',
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
    'Continua'
  ];

  const charges = defaultCharges.map(name => chargeRepository.create({
    id: uuidv4(),
    name,
    retreatId: retreat.id,
    retreat,
  }));

  return chargeRepository.save(charges);
};
