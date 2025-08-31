import { AppDataSource } from '../data-source';
import { House } from '../entities/house.entity';

export const getHouses = async () => {
  const houseRepository = AppDataSource.getRepository(House);
  return houseRepository.find();
};
