import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { House } from '../entities/house.entity';
import { Bed } from '../entities/bed.entity';
import { getRepositories } from '../utils/repositoryHelpers';
// import { CreateHouse, UpdateHouse } from '@repo/types'; // Types will be defined when needed

export const getHouses = async (dataSource?: DataSource): Promise<House[]> => {
	const repos = getRepositories(dataSource);
	return repos.house.find({ relations: ['beds'] });
};

export const findById = async (id: string, dataSource?: DataSource): Promise<House | null> => {
	const repos = getRepositories(dataSource);
	return repos.house.findOne({ where: { id }, relations: ['beds'] });
};

export const createHouse = async (
	houseData: any, // CreateHouse
	dataSource?: DataSource,
): Promise<House> => {
	const repos = getRepositories(dataSource);
	const { id, beds, name, ...houseInfo } = houseData;

	const existingHouse = await repos.house.findOne({ where: { name } });
	if (existingHouse) {
		const error = new Error('House with the same name already exists');
		(error as any).statusCode = 409;
		throw error;
	}

	const newHouse = repos.house.create({ ...houseInfo, name });
	const savedHouse = await repos.house.save(newHouse);

	if (beds && beds.length > 0) {
		const newBeds = beds.map((bed: any) => {
			// remove id from bed object if it exists
			const { id, ...bedInfo } = bed;
			return repos.bed.create({ ...bedInfo, house: savedHouse });
		});
		await repos.bed.save(newBeds);
	}

	const result = await findById((savedHouse as unknown as House).id, dataSource);
	if (!result) {
		throw new Error('Could not find created house');
	}
	return result;
};

export const updateHouse = async (
	id: string,
	houseData: any, // UpdateHouse
	dataSource?: DataSource,
): Promise<House | null> => {
	const repos = getRepositories(dataSource);
	const house = await repos.house.findOneBy({ id });
	if (!house) {
		return null;
	}

	const { beds, name, ...houseInfo } = houseData;

	if (name && name !== house.name) {
		const existingHouse = await repos.house.findOne({ where: { name } });
		if (existingHouse) {
			const error = new Error('House with the same name already exists');
			(error as any).statusCode = 409;
			throw error;
		}
	}

	// Update house properties
	// Note: merge is not directly available on the repository, need to use Object.assign
	Object.assign(house, { ...houseInfo, name });
	await repos.house.save(house);

	// Manage beds
	if (beds) {
		// Delete beds that are no longer in the list
		const bedIds = beds.map((b: any) => b.id).filter(Boolean);
		if (bedIds.length > 0) {
			const bedsToDelete = await repos.bed
				.createQueryBuilder('bed')
				.where('bed.houseId = :houseId', { houseId: id })
				.andWhere('bed.id NOT IN (:...bedIds)', { bedIds })
				.getMany();
			if (bedsToDelete.length > 0) {
				await repos.bed.remove(bedsToDelete);
			}
		} else {
			// if there are no bedIds, it means all beds should be deleted
			const bedsToDelete = await repos.bed
				.createQueryBuilder('bed')
				.where('bed.houseId = :houseId', { houseId: id })
				.getMany();
			if (bedsToDelete.length > 0) {
				await repos.bed.remove(bedsToDelete);
			}
		}

		// Create or update beds
		const bedsToSave = beds.map((bed: any) => {
			const { id: bedId, ...bedInfo } = bed;
			const bedEntity = repos.bed.create({ ...bedInfo, house });
			if (bedId) {
				(bedEntity as unknown as Bed).id = bedId;
			}
			return bedEntity;
		});
		await repos.bed.save(bedsToSave);
	}

	return findById(id, dataSource);
};

export const deleteHouse = async (id: string, dataSource?: DataSource): Promise<void> => {
	const repos = getRepositories(dataSource);
	const house = await repos.house.findOne({ where: { id }, relations: ['beds'] });
	if (house) {
		if (house.beds && house.beds.length > 0) {
			await repos.bed.remove(house.beds);
		}
		await repos.house.remove(house);
	}
};
