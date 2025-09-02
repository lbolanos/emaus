import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';
import { CreateParticipant, UpdateParticipant } from '@repo/types';

const participantRepository = AppDataSource.getRepository(Participant);

export const findAllParticipants = async (retreatId?: string, type?: 'walker' | 'server'): Promise<Participant[]> => {
  if (retreatId) {
    return participantRepository.find({ where: { retreatId: retreatId, type: type  } });
  }
  return participantRepository.find();
};

export const findParticipantById = async (id: string): Promise<Participant | null> => {
  return participantRepository.findOneBy({ id });
};

export const createParticipant = async (
  participantData: CreateParticipant
): Promise<Participant> => {
  const newParticipant = participantRepository.create({
    ...participantData
  });
  return participantRepository.save(newParticipant);
};

export const updateParticipant = async (
  id: string,
  participantData: UpdateParticipant
): Promise<Participant | null> => {
  const participant = await participantRepository.findOneBy({ id });
  if (!participant) {
    return null;
  }
  participantRepository.merge(participant, participantData);
  return participantRepository.save(participant);
};

export const deleteParticipant = async (id: string): Promise<void> => {
  await participantRepository.delete(id);
};