import { DataSource } from 'typeorm';
import { House } from '../entities/house.entity';
import { Bed } from '../entities/bed.entity';
import { Retreat } from '../entities/retreat.entity';
import { RetreatBed } from '../entities/retreatBed.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { Participant } from '../entities/participant.entity';
import { User } from '../entities/user.entity';
import { Charge } from '../entities/charge.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { InventoryCategory } from '../entities/inventoryCategory.entity';
import { InventoryTeam } from '../entities/inventoryTeam.entity';
import { InventoryItem } from '../entities/inventoryItem.entity';
import { RetreatInventory } from '../entities/retreatInventory.entity';

export function createDatabaseConfig() {
	const dbType = process.env.DB_TYPE || 'sqlite';

	const entities = [
		House,
		Bed,
		Retreat,
		RetreatBed,
		TableMesa,
		Participant,
		User,
		Charge,
		MessageTemplate,
		InventoryCategory,
		InventoryTeam,
		InventoryItem,
		RetreatInventory,
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
