import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import { House } from '../entities/house.entity';
import { RetreatBed } from '../entities/retreatBed.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { Role } from '../entities/role.entity';
import { getRepository, getRepositories } from '../utils/repositoryHelpers';
import { GlobalMessageTemplateService } from './globalMessageTemplateService';
import { createDefaultResponsibilitiesForRetreat } from './responsabilityService';
import { createDefaultTablesForRetreat } from './tableMesaService';
import { createDefaultInventoryForRetreat } from './inventoryService';
import { createDefaultInventoryData } from '../data/inventorySeeder';
import { authorizationService } from '../middleware/authorization';
import { ROLES } from '@repo/types';
import type { CreateRetreat, UpdateRetreat } from '@repo/types';
import { v4 as uuidv4 } from 'uuid';

export const getRetreats = async (dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	return retreatRepository.find({ relations: ['house'], order: { startDate: 'DESC' } });
};

export const getRetreatsForUser = async (userId: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);

	// Check if user is superadmin - if so, return all retreats
	const isSuperadmin = await authorizationService.hasRole(userId, ROLES.superadmin);
	if (isSuperadmin) {
		return repos.retreat.find({ relations: ['house'], order: { startDate: 'DESC' } });
	}

	// Get retreats the user has access to via user_retreats table
	const userRetreats = await repos.userRetreat.find({
		where: { userId, status: 'active' },
		relations: ['retreat'],
	});

	const retreatIdsFromUserRetreats = userRetreats.map((ur) => ur.retreatId);

	// Get retreats the user created
	const createdRetreats = await repos.retreat.find({
		where: { createdBy: userId },
		relations: ['house'],
	});

	const retreatIdsFromCreated = createdRetreats.map((r) => r.id);

	// Combine both sets of retreat IDs and remove duplicates
	const allRetreatIds = [...new Set([...retreatIdsFromUserRetreats, ...retreatIdsFromCreated])];

	if (allRetreatIds.length === 0) {
		return [];
	}

	// Use TypeORM's In operator to get all accessible retreats
	const queryBuilder = repos.retreat.createQueryBuilder('retreat');
	queryBuilder.where('retreat.id IN (:...retreatIds)', { retreatIds: allRetreatIds });
	queryBuilder.leftJoinAndSelect('retreat.house', 'house');
	queryBuilder.orderBy('retreat.startDate', 'DESC');
	const retreats = await queryBuilder.getMany();

	return retreats;
};

import { In, MoreThan } from 'typeorm';

export const findPublicRetreats = async (dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	return retreatRepository.find({
		where: {
			isPublic: true,
			startDate: MoreThan(new Date())
		},
		order: { startDate: 'ASC' }
	});
};

export const findById = async (id: string, dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	return retreatRepository.findOne({ where: { id }, relations: ['house'] });
};

export const update = async (id: string, retreatData: UpdateRetreat, dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	const retreat = await retreatRepository.findOne({ where: { id } });
	if (!retreat) {
		return null;
	}
	Object.assign(retreat, retreatData);
	await retreatRepository.save(retreat);
	return retreat;
};

export const createRetreat = async (
	retreatData: CreateRetreat & { createdBy?: string },
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	// 0. Ensure default inventory data exists
	await createDefaultInventoryData();

	// 1. Create and save the retreat
	const newRetreat = repos.retreat.create({
		...retreatData,
		id: uuidv4(),
	});
	await repos.retreat.save(newRetreat);

	// 2. Assign retreat creator role to the user
	if (retreatData.createdBy) {
		console.log('Creating UserRetreat assignment for retreat creator:', {
			userId: retreatData.createdBy,
			retreatId: newRetreat.id,
		});

		// Get the admin role for retreat-specific assignment
		const adminRole = await repos.role.findOne({ where: { name: 'admin' } });
		if (adminRole) {
			console.log('Found admin role:', adminRole);
			const creatorRetreatAssignment = repos.userRetreat.create({
				userId: retreatData.createdBy,
				retreatId: newRetreat.id,
				roleId: adminRole.id,
				status: 'active',
				invitedBy: retreatData.createdBy, // Self-invited
				invitedAt: new Date(),
			});
			console.log('Created UserRetreat assignment:', creatorRetreatAssignment);
			await repos.userRetreat.save(creatorRetreatAssignment);
			console.log('UserRetreat assignment saved successfully');
		} else {
			console.log('Admin role not found!');
		}
	} else {
		console.log('No createdBy field in retreatData:', retreatData);
	}

	// 3. Create default responsibilities
	await createDefaultResponsibilitiesForRetreat(newRetreat, dataSource);

	// 4. Create default tables
	await createDefaultTablesForRetreat(newRetreat, dataSource);

	// 5. Copy global message templates to this retreat
	const globalMessageTemplateService = new GlobalMessageTemplateService(dataSource);
	await globalMessageTemplateService.copyAllActiveTemplatesToRetreat(newRetreat);

	// 6. Create default inventory
	await createDefaultInventoryForRetreat(newRetreat, dataSource);

	// 7. Create retreat beds from house beds
	if (retreatData.houseId) {
		const house = await repos.house.findOne({
			where: { id: retreatData.houseId },
			relations: ['beds'],
		});

		if (house && house.beds) {
			const newRetreatBeds = house.beds.map((bed) => {
				return repos.retreatBed.create({
					id: uuidv4(),
					roomNumber: bed.roomNumber,
					bedNumber: bed.bedNumber,
					floor: bed.floor,
					type: bed.type,
					defaultUsage: bed.defaultUsage,
					retreat: newRetreat,
				});
			});
			await repos.retreatBed.save(newRetreatBeds);
		}
	}

	// Fetch the retreat with house relation before returning
	const result = await repos.retreat.findOne({
		where: { id: newRetreat.id },
		relations: ['house'],
	});

	return result;
};
