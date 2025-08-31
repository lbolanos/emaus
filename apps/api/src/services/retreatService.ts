import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import type { CreateRetreat } from '@repo/types';
import { v4 as uuidv4 } from 'uuid';

export const getRetreats = async () => {
  const retreatRepository = AppDataSource.getRepository(Retreat);
  return retreatRepository.find({ order: { startDate: 'DESC' } });
};

export const createRetreat = async (retreatData: CreateRetreat) => {
  const retreatRepository = AppDataSource.getRepository(Retreat);

  if (retreatData.houseId === '') {
    retreatData.houseId = undefined;
  }

  const newRetreat = retreatRepository.create({
    ...retreatData,
    id: uuidv4(),
  });
  await retreatRepository.save(newRetreat);
  return newRetreat;
};
