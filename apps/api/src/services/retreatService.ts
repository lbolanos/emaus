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
import { seedDefaultShirtTypes } from './shirtTypeService';
import { createDefaultInventoryForRetreat } from './inventoryService';
import { createDefaultServiceTeamsForRetreat } from './serviceTeamService';
import { createDefaultInventoryData } from '../data/inventorySeeder';
import { createDefaultScheduleTemplate } from '../data/scheduleTemplateSeeder';
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

import { In, MoreThan, Not } from 'typeorm';

export const findPublicRetreats = async (dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	return retreatRepository.find({
		where: {
			isPublic: true,
			startDate: MoreThan(new Date()),
		},
		relations: ['house'],
		order: { startDate: 'ASC' },
	});
};

export const findActiveRetreats = async (dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	const today = new Date();
	const bufferStart = new Date(today);
	bufferStart.setDate(bufferStart.getDate() + 1);
	const bufferEnd = new Date(today);
	bufferEnd.setDate(bufferEnd.getDate() - 1);
	const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

	return retreatRepository
		.createQueryBuilder('retreat')
		.select([
			'retreat.id',
			'retreat.parish',
			'retreat.startDate',
			'retreat.endDate',
		])
		.where('retreat.startDate <= :bufferStart', { bufferStart: toIsoDate(bufferStart) })
		.andWhere('retreat.endDate >= :bufferEnd', { bufferEnd: toIsoDate(bufferEnd) })
		.orderBy('retreat.startDate', 'ASC')
		.getMany();
};

export const findById = async (id: string, dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	return retreatRepository.findOne({ where: { id }, relations: ['house'] });
};

export const findBySlug = async (slug: string, dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	return retreatRepository.findOne({ where: { slug }, relations: ['house'] });
};

export const isSlugAvailable = async (
	slug: string,
	excludeRetreatId?: string,
	dataSource?: DataSource,
) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	const where: any = { slug };
	if (excludeRetreatId) {
		where.id = Not(excludeRetreatId);
	}
	const existing = await retreatRepository.findOne({ where });
	return !existing;
};

export const refreshRetreatBedsFromHouse = async (
	retreatId: string,
	houseId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	// 1. Delete all existing retreat beds
	await repos.retreatBed.delete({ retreat: { id: retreatId } });

	// 2. Fetch house with beds relation
	const house = await repos.house.findOne({
		where: { id: houseId },
		relations: ['beds'],
	});

	// 3. Create new RetreatBed records from house beds
	if (house && house.beds) {
		const retreat = await repos.retreat.findOne({ where: { id: retreatId } });
		if (retreat) {
			const newRetreatBeds = house.beds.map((bed) => {
				return repos.retreatBed.create({
					id: uuidv4(),
					roomNumber: bed.roomNumber,
					bedNumber: bed.bedNumber,
					floor: bed.floor,
					type: bed.type,
					defaultUsage: bed.defaultUsage,
					floorLabel: bed.floorLabel,
					retreat,
				});
			});
			await repos.retreatBed.save(newRetreatBeds);
		}
	}
};

export const update = async (
	id: string,
	retreatData: UpdateRetreat,
	refreshBeds?: boolean,
	dataSource?: DataSource,
) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	const retreat = await retreatRepository.findOne({ where: { id } });
	if (!retreat) {
		return null;
	}

	// Validate slug uniqueness
	if (retreatData.slug && retreatData.slug !== retreat.slug) {
		const available = await isSlugAvailable(retreatData.slug, id, dataSource);
		if (!available) {
			throw Object.assign(new Error('Este slug ya está en uso por otro retiro.'), { statusCode: 409 });
		}
	}

	Object.assign(retreat, retreatData);
	await retreatRepository.save(retreat);

	if (refreshBeds && retreat.houseId) {
		await refreshRetreatBedsFromHouse(id, retreat.houseId, dataSource);
		// Re-assign participants to the new beds
		const { autoAssignBedsForRetreat } = await import('./participantService');
		await autoAssignBedsForRetreat(id);
	}

	return retreat;
};

export const createRetreat = async (
	retreatData: CreateRetreat & { createdBy?: string },
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	// 0. Ensure default inventory + schedule template data exist
	await createDefaultInventoryData();
	await createDefaultScheduleTemplate();

	// Validate slug uniqueness
	if (retreatData.slug) {
		const available = await isSlugAvailable(retreatData.slug, undefined, dataSource);
		if (!available) {
			throw Object.assign(new Error('Este slug ya está en uso por otro retiro.'), { statusCode: 409 });
		}
	}

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

	// 4.5. Create default service teams
	await createDefaultServiceTeamsForRetreat(newRetreat, dataSource);

	// 5. Copy global message templates to this retreat
	const globalMessageTemplateService = new GlobalMessageTemplateService(dataSource);
	await globalMessageTemplateService.copyAllActiveTemplatesToRetreat(newRetreat);

	// 6. Create default inventory
	await createDefaultInventoryForRetreat(newRetreat, dataSource);

	// 6.5. Seed default Mexican-style shirt types
	await seedDefaultShirtTypes(newRetreat.id);

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
					floorLabel: bed.floorLabel,
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
