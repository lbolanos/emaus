import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import { House } from '../entities/house.entity';
import { RetreatBed } from '../entities/retreatBed.entity';
import { GlobalMessageTemplateService } from './globalMessageTemplateService';
import { createDefaultResponsibilitiesForRetreat } from './responsabilityService';
import { createDefaultTablesForRetreat } from './tableMesaService';
import { createDefaultInventoryForRetreat } from './inventoryService';
import { createDefaultInventoryData } from '../data/inventorySeeder';
import type { CreateRetreat, UpdateRetreat } from '@repo/types';
import { v4 as uuidv4 } from 'uuid';

export const getRetreats = async () => {
	const retreatRepository = AppDataSource.getRepository(Retreat);
	return retreatRepository.find({ relations: ['house'], order: { startDate: 'DESC' } });
};

export const findById = async (id: string) => {
	const retreatRepository = AppDataSource.getRepository(Retreat);
	return retreatRepository.findOne({ where: { id }, relations: ['house'] });
};

export const update = async (id: string, retreatData: UpdateRetreat) => {
	const retreatRepository = AppDataSource.getRepository(Retreat);
	const retreat = await retreatRepository.findOne({ where: { id } });
	if (!retreat) {
		return null;
	}
	Object.assign(retreat, retreatData);
	await retreatRepository.save(retreat);
	return retreat;
};

export const createRetreat = async (retreatData: CreateRetreat) => {
	const retreatRepository = AppDataSource.getRepository(Retreat);
	const houseRepository = AppDataSource.getRepository(House);
	const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

	// 0. Ensure default inventory data exists
	await createDefaultInventoryData();

	// 1. Create and save the retreat
	const newRetreat = retreatRepository.create({
		...retreatData,
		id: uuidv4(),
	});
	await retreatRepository.save(newRetreat);

	// 2. Create default responsibilities
	await createDefaultResponsibilitiesForRetreat(newRetreat);

	// 3. Create default tables
	await createDefaultTablesForRetreat(newRetreat);

	// 4. Copy global message templates to this retreat
	const globalMessageTemplateService = new GlobalMessageTemplateService();
	await globalMessageTemplateService.copyAllActiveTemplatesToRetreat(newRetreat);

	// 5. Create default inventory
	await createDefaultInventoryForRetreat(newRetreat);

	// 6. Create retreat beds from house beds
	if (retreatData.houseId) {
		const house = await houseRepository.findOne({
			where: { id: retreatData.houseId },
			relations: ['beds'],
		});

		if (house && house.beds) {
			const newRetreatBeds = house.beds.map((bed) => {
				return retreatBedRepository.create({
					id: uuidv4(),
					roomNumber: bed.roomNumber,
					bedNumber: bed.bedNumber,
					floor: bed.floor,
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
