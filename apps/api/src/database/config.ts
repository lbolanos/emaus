import { DataSource } from 'typeorm';
import { House } from '../entities/house.entity';
import { Bed } from '../entities/bed.entity';
import { Retreat } from '../entities/retreat.entity';
import { RetreatBed } from '../entities/retreatBed.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { Participant } from '../entities/participant.entity';
import { User } from '../entities/user.entity';
import { Responsability } from '../entities/responsability.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { InventoryCategory } from '../entities/inventoryCategory.entity';
import { InventoryTeam } from '../entities/inventoryTeam.entity';
import { InventoryItem } from '../entities/inventoryItem.entity';
import { RetreatInventory } from '../entities/retreatInventory.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/userRole.entity';
import { RolePermission } from '../entities/rolePermission.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { Permission } from '../entities/permission.entity';
import { Migration } from '../entities/migration.entity';
import { Payment } from '../entities/payment.entity';
import { GlobalMessageTemplate } from '../entities/globalMessageTemplate.entity';
import { ParticipantCommunication } from '../entities/participantCommunication.entity';

import { Session } from '../entities/session.entity';

export function createDatabaseConfig() {
	const dbType = process.env.DB_TYPE || 'sqlite';

	const entities = [
		Session,
		House,
		Bed,
		Retreat,
		RetreatBed,
		TableMesa,
		Participant,
		User,
		Responsability,
		MessageTemplate,
		GlobalMessageTemplate,
		InventoryCategory,
		InventoryTeam,
		InventoryItem,
		RetreatInventory,
		Role,
		UserRole,
		RolePermission,
		UserRetreat,
		Permission,
		Migration,
		Payment,
		ParticipantCommunication,
		// Temporarily excluding entities with enum issues
		// AuditLog,
		// PermissionOverride,
		// RoleRequest,
	];

	if (dbType === 'postgresql') {
		return {
			type: 'postgres' as const,
			host: process.env.DB_HOST || 'localhost',
			port: parseInt(process.env.DB_PORT || '5432'),
			username: process.env.DB_USERNAME || 'postgres',
			password: process.env.DB_PASSWORD || 'password',
			database: process.env.DB_DATABASE || 'emaus',
			synchronize: false,
			logging: false,
			entities,
			migrations: [],
			subscribers: [],
		};
	} else {
		return {
			type: 'sqlite' as const,
			database: process.env.DB_DATABASE || 'database.sqlite',
			synchronize: false,
			logging: false,
			entities,
			migrations: [],
			subscribers: [],
		};
	}
}
