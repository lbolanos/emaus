import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';
import { CreateWalker, CreateServer, UpdateParticipant } from '@repo/types';

const participantRepository = AppDataSource.getRepository(Participant);

export const findAllParticipants = async (retreatId?: string): Promise<Participant[]> => {
  if (retreatId) {
    return participantRepository.find({ where: { retreatId: retreatId } });
  }
  return participantRepository.find();
};

export const findParticipantById = async (id: string): Promise<Participant | null> => {
  return participantRepository.findOneBy({ id });
};

export const createWalker = async (
  walkerData: CreateWalker
): Promise<Participant> => {
  const newWalker = participantRepository.create({
    ...walkerData,
    type: 'walker',
  });
  return participantRepository.save(newWalker);
};

export const createServer = async (
  serverData: CreateServer
): Promise<Participant> => {
  const newServer = participantRepository.create({
    ...serverData,
    type: 'server',
  });
  return participantRepository.save(newServer);
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