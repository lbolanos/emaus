import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../data-source';
import { House } from '../entities/house.entity';
import { Bed } from '../entities/bed.entity';
import { Retreat } from '../entities/retreat.entity';
import { RetreatBed } from '../entities/retreatBed.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { Participant } from '../entities/participant.entity';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { Session } from '../entities/session.entity';
import { UserRole } from '../entities/userRole.entity';
import { Permission } from '../entities/permission.entity';
import { Responsability } from '../entities/responsability.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { InventoryCategory } from '../entities/inventoryCategory.entity';
import { InventoryTeam } from '../entities/inventoryTeam.entity';
import { InventoryItem } from '../entities/inventoryItem.entity';
import { RetreatInventory } from '../entities/retreatInventory.entity';
import { GlobalMessageTemplate } from '../entities/globalMessageTemplate.entity';
import { Tag } from '../entities/tag.entity';
import { ParticipantTag } from '../entities/participantTag.entity';

/**
 * Get a repository for an entity, optionally using a custom DataSource.
 * This allows tests to pass a test database while production uses AppDataSource.
 */
export function getRepository<T>(
	entity: { new (): T } | string,
	dataSource?: DataSource,
): Repository<T> {
	const ds = dataSource || AppDataSource;
	return ds.getRepository(entity);
}

/**
 * Get multiple repositories at once, optionally using a custom DataSource.
 */
export function getRepositories(dataSource?: DataSource) {
	const ds = dataSource || AppDataSource;
	return {
		house: ds.getRepository(House),
		bed: ds.getRepository(Bed),
		retreat: ds.getRepository(Retreat),
		retreatBed: ds.getRepository(RetreatBed),
		tableMesa: ds.getRepository(TableMesa),
		participant: ds.getRepository(Participant),
		user: ds.getRepository(User),
		role: ds.getRepository(Role),
		userRetreat: ds.getRepository(UserRetreat),
		session: ds.getRepository(Session),
		userRole: ds.getRepository(UserRole),
		permission: ds.getRepository(Permission),
		responsability: ds.getRepository(Responsability),
		messageTemplate: ds.getRepository(MessageTemplate),
		inventoryCategory: ds.getRepository(InventoryCategory),
		inventoryTeam: ds.getRepository(InventoryTeam),
		inventoryItem: ds.getRepository(InventoryItem),
		retreatInventory: ds.getRepository(RetreatInventory),
		globalMessageTemplate: ds.getRepository(GlobalMessageTemplate),
		tag: ds.getRepository(Tag),
		participantTag: ds.getRepository(ParticipantTag),
	};
}

/**
 * Get all entities for metadata building, optionally using a custom DataSource.
 */
export function getAllEntities() {
	return [
		House,
		Bed,
		Retreat,
		RetreatBed,
		TableMesa,
		Participant,
		User,
		Role,
		UserRetreat,
		Session,
		UserRole,
		Permission,
		Responsability,
		MessageTemplate,
		InventoryCategory,
		InventoryTeam,
		InventoryItem,
		RetreatInventory,
		GlobalMessageTemplate,
		Tag,
		ParticipantTag,
	];
}
