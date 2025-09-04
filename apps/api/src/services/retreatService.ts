import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import { Table } from '../entities/table.entity';
import { House } from '../entities/house.entity';
import { RetreatBed } from '../entities/retreatBed.entity';
import type { CreateRetreat } from '@repo/types';
import { v4 as uuidv4 } from 'uuid';

export const getRetreats = async () => {
  const retreatRepository = AppDataSource.getRepository(Retreat);
  return retreatRepository.find({ relations: ['house'], order: { startDate: 'DESC' } });
};

export const createRetreat = async (retreatData: CreateRetreat) => {
  const retreatRepository = AppDataSource.getRepository(Retreat);
  const tableRepository = AppDataSource.getRepository(Table);
  const houseRepository = AppDataSource.getRepository(House);
  const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

  // 1. Create and save the retreat
  const newRetreat = retreatRepository.create({
    ...retreatData,
    id: uuidv4(),
  });
  await retreatRepository.save(newRetreat);

  // 2. Create default tables
  for (let i = 1; i <= 5; i++) {
    const newTable = tableRepository.create({
      id: uuidv4(),
      name: `Table ${i}`,
      retreat: newRetreat,
    });
    await tableRepository.save(newTable);
  }

  // 3. Create retreat beds from house beds
  if (retreatData.houseId) {
    const house = await houseRepository.findOne({
      where: { id: retreatData.houseId },
      relations: ['beds'],
    });

    if (house && house.beds) {
      const newRetreatBeds = house.beds.map(bed => {
        return retreatBedRepository.create({
          id: uuidv4(),
          roomNumber: bed.roomNumber,
          bedNumber: bed.bedNumber,
          type: bed.type,
          defaultUsage: bed.defaultUsage,
          retreat: newRetreat,
        });
      });
      await retreatBedRepository.save(newRetreatBeds);
    }
  }

  return newRetreat;
};
