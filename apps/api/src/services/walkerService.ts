import { AppDataSource } from '../data-source';
import { Walker } from '../entities/walker.entity';
import { CreateWalker, UpdateWalker } from '@repo/types';

const walkerRepository = AppDataSource.getRepository(Walker);

export const findAllWalkers = async (): Promise<Walker[]> => {
  return walkerRepository.find();
};

export const findWalkerById = async (id: string): Promise<Walker | null> => {
  return walkerRepository.findOneBy({ id });
};

export const createWalker = async (
  walkerData: CreateWalker
): Promise<Walker> => {
  const newWalker = walkerRepository.create(walkerData);
  return walkerRepository.save(newWalker);
};

export const updateWalker = async (
  id: string,
  walkerData: UpdateWalker
): Promise<Walker | null> => {
  const walker = await walkerRepository.findOneBy({ id });
  if (!walker) {
    return null;
  }
  walkerRepository.merge(walker, walkerData);
  return walkerRepository.save(walker);
};

export const deleteWalker = async (id: string): Promise<void> => {
  await walkerRepository.delete(id);
};