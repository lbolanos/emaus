import { AppDataSource } from '../data-source';
import { House } from '../entities/house.entity';
import { Bed } from '../entities/bed.entity';
// import { CreateHouse, UpdateHouse } from '@repo/types'; // TODO: Define these types

const houseRepository = AppDataSource.getRepository(House);
const bedRepository = AppDataSource.getRepository(Bed);

export const findAllHouses = async (): Promise<House[]> => {
  return houseRepository.find({ relations: ['beds'] });
};

export const findHouseById = async (id: string): Promise<House | null> => {
  return houseRepository.findOne({ where: { id }, relations: ['beds'] });
};

export const createHouse = async (
  houseData: any // CreateHouse
): Promise<House> => {
  const { id, beds, name, ...houseInfo } = houseData;

  const existingHouse = await houseRepository.findOne({ where: { name } });
  if (existingHouse) {
    const error = new Error('House with the same name already exists');
    (error as any).statusCode = 409;
    throw error;
  }

  const newHouse = houseRepository.create({ ...houseInfo, name });
  const savedHouse = await houseRepository.save(newHouse);

  if (beds && beds.length > 0) {
    const newBeds = beds.map((bed: any) => {
      // remove id from bed object if it exists
      const { id, ...bedInfo } = bed;
      return bedRepository.create({ ...bedInfo, house: savedHouse });
    });
    await bedRepository.save(newBeds);
  }

  const result = await findHouseById((savedHouse as unknown as House).id);
  if (!result) {
    throw new Error('Could not find created house');
  }
  return result;
};

export const updateHouse = async (
  id: string,
  houseData: any // UpdateHouse
): Promise<House | null> => {
  const house = await houseRepository.findOneBy({ id });
  if (!house) {
    return null;
  }

  const { beds, name, ...houseInfo } = houseData;

  if (name && name !== house.name) {
    const existingHouse = await houseRepository.findOne({ where: { name } });
    if (existingHouse) {
      const error = new Error('House with the same name already exists');
      (error as any).statusCode = 409;
      throw error;
    }
  }

  // Update house properties
  houseRepository.merge(house, { ...houseInfo, name });
  await houseRepository.save(house);

  // M-anage beds
  if (beds) {
    // Delete beds that are no longer in the list
    const bedIds = beds.map((b: any) => b.id).filter(Boolean);
    if (bedIds.length > 0) {
      const bedsToDelete = await bedRepository.createQueryBuilder('bed')
        .where('bed.houseId = :houseId', { houseId: id })
        .andWhere('bed.id NOT IN (:...bedIds)', { bedIds })
        .getMany();
      if (bedsToDelete.length > 0) {
        await bedRepository.remove(bedsToDelete);
      }
    } else {
        // if there are no bedIds, it means all beds should be deleted
        const bedsToDelete = await bedRepository.createQueryBuilder('bed')
            .where('bed.houseId = :houseId', { houseId: id })
            .getMany();
        if (bedsToDelete.length > 0) {
            await bedRepository.remove(bedsToDelete);
        }
    }


    // Create or update beds
    const bedsToSave = beds.map((bed: any) => {
        const { id: bedId, ...bedInfo } = bed;
        const bedEntity = bedRepository.create({ ...bedInfo, house });
        if (bedId) {
            (bedEntity as unknown as Bed).id = bedId;
        }
        return bedEntity;
    });
    await bedRepository.save(bedsToSave);
  }

  return findHouseById(id);
};

export const deleteHouse = async (id: string): Promise<void> => {
    const house = await houseRepository.findOne({ where: { id }, relations: ['beds'] });
    if(house){
        if (house.beds && house.beds.length > 0) {
            await bedRepository.remove(house.beds);
        }
        await houseRepository.remove(house);
    }
};