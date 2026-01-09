import { DataSource } from 'typeorm';
import { AppDataSource } from '@/data-source';
import { User } from '@/entities/user.entity';
import { Retreat } from '@/entities/retreat.entity';
import { House } from '@/entities/house.entity';
import { TableMesa } from '@/entities/tableMesa.entity';
import { RetreatBed, BedUsage, BedType } from '@/entities/retreatBed.entity';
import { InventoryItem } from '@/entities/inventoryItem.entity';
import { InventoryCategory } from '@/entities/inventoryCategory.entity';
import { InventoryTeam } from '@/entities/inventoryTeam.entity';
import { RetreatInventory } from '@/entities/retreatInventory.entity';
import { MessageTemplate } from '@/entities/messageTemplate.entity';
import { Community } from '@/entities/community.entity';
import { CommunityMember } from '@/entities/communityMember.entity';
import { CommunityMeeting } from '@/entities/communityMeeting.entity';
import { CommunityAttendance } from '@/entities/communityAttendance.entity';
import { CommunityAdmin } from '@/entities/communityAdmin.entity';
import { Participant } from '@/entities/participant.entity';
import * as bcrypt from 'bcrypt';

/**
 * Test data factory for creating test entities for testing
 *
 * Can work with either the default AppDataSource or a custom test DataSource.
 * Pass a custom dataSource when working with isolated test databases.
 */
export class TestDataFactory {
	private static testDataSource: DataSource = AppDataSource;

	/**
	 * Set a custom data source for testing
	 */
	static setDataSource(dataSource: DataSource) {
		this.testDataSource = dataSource;
	}

	/**
	 * Get the current data source
	 */
	static getDataSource(): DataSource {
		return this.testDataSource;
	}

	/**
	 * Create a test user with specified role
	 */
	static async createTestUser(overrides: Partial<User> = {}): Promise<User> {
		const userRepository = this.testDataSource.getRepository(User);

		// Generate a UUID for the user
		const userId = userRepository.createQueryBuilder().select();

		const defaultUser: Partial<User> = {
			id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			email: `test-${Date.now()}@example.com`,
			displayName: 'Test User',
			password: await bcrypt.hash('password123', 10),
			isPending: false,
			...overrides,
		};

		const user = userRepository.create(defaultUser);
		return await userRepository.save(user);
	}

	/**
	 * Create a test retreat with house and basic configuration
	 */
	static async createTestRetreat(overrides: Partial<Retreat> = {}): Promise<Retreat> {
		const retreatRepository = this.testDataSource.getRepository(Retreat);
		const houseRepository = this.testDataSource.getRepository(House);

		// Create associated house
		const house = houseRepository.create({
			name: 'Test House',
			address1: '123 Test Street',
			city: 'Test City',
			state: 'Test State',
			zipCode: '12345',
			country: 'Test Country',
			capacity: 100,
			notes: 'Test house for Excel import testing',
		});
		const savedHouse = await houseRepository.save(house);

		const defaultRetreat: Partial<Retreat> = {
			parish: `Test Parish ${Date.now()}`,
			startDate: new Date(),
			endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
			houseId: savedHouse.id,
			...overrides,
		};

		const retreat = retreatRepository.create(defaultRetreat);
		return await retreatRepository.save(retreat);
	}

	/**
	 * Create test tables for a retreat
	 */
	static async createTestTables(retreatId: string, count: number = 5): Promise<TableMesa[]> {
		const tableRepository = this.testDataSource.getRepository(TableMesa);
		const tables: TableMesa[] = [];

		for (let i = 1; i <= count; i++) {
			const table = tableRepository.create({
				name: `Table ${i}`,
				retreatId,
				maxWalkers: 8,
			});
			tables.push(await tableRepository.save(table));
		}

		return tables;
	}

	/**
	 * Create test beds for a retreat house
	 */
	static async createTestBeds(
		retreatId: string,
		houseId: string,
		count: number = 20,
	): Promise<RetreatBed[]> {
		const retreatBedRepository = this.testDataSource.getRepository(RetreatBed);
		const beds: RetreatBed[] = [];

		for (let i = 1; i <= count; i++) {
			const bed = retreatBedRepository.create({
				roomNumber: `${Math.ceil(i / 4)}`, // 4 beds per room
				bedNumber: `${((i - 1) % 4) + 1}`,
				floor: Math.ceil(i / 10), // Floors 1-2
				type:
					i % 4 === 0
						? BedType.NORMAL
						: i % 4 === 1
							? BedType.LITERA_ABAJO
							: i % 4 === 2
								? BedType.LITERA_ARRIBA
								: BedType.COLCHON,
				defaultUsage: i % 2 === 0 ? BedUsage.CAMINANTE : BedUsage.SERVIDOR,
				retreatId,
				houseId,
			});
			beds.push(await retreatBedRepository.save(bed));
		}

		return beds;
	}

	/**
	 * Create test inventory items
	 */
	static async createTestInventoryItems(count: number = 10): Promise<InventoryItem[]> {
		const inventoryRepository = this.testDataSource.getRepository(InventoryItem);
		const categoryRepository = this.testDataSource.getRepository(InventoryCategory);
		const teamRepository = this.testDataSource.getRepository(InventoryTeam);
		const items: InventoryItem[] = [];

		// Create a test category
		const category = categoryRepository.create({
			name: 'Test Category',
			description: 'Test category for inventory items',
		});
		const savedCategory = await categoryRepository.save(category);

		// Create a test team
		const team = teamRepository.create({
			name: 'Test Team',
			description: 'Test team for inventory items',
		});
		const savedTeam = await teamRepository.save(team);

		for (let i = 1; i <= count; i++) {
			const item = inventoryRepository.create({
				name: `Test Item ${i}`,
				description: `Description for test item ${i}`,
				categoryId: savedCategory.id,
				teamId: savedTeam.id,
				ratio: 2.0,
				unit: 'pieces',
				isCalculated: false,
				isActive: true,
			});
			items.push(await inventoryRepository.save(item));
		}

		return items;
	}

	/**
	 * Create retreat inventory records
	 */
	static async createRetreatInventory(
		retreatId: string,
		items: InventoryItem[],
	): Promise<RetreatInventory[]> {
		const retreatInventoryRepository = this.testDataSource.getRepository(RetreatInventory);
		const inventory: RetreatInventory[] = [];

		for (const item of items) {
			const requiredQty = Math.floor(Math.random() * 50) + 10; // 10-60 items
			const retreatItem = retreatInventoryRepository.create({
				retreatId,
				inventoryItemId: item.id,
				requiredQuantity: requiredQty,
				currentQuantity: requiredQty,
				isSufficient: true,
			});
			inventory.push(await retreatInventoryRepository.save(retreatItem));
		}

		return inventory;
	}

	/**
	 * Create test message templates
	 */
	static async createTestMessageTemplates(retreatId: string): Promise<MessageTemplate[]> {
		const templateRepository = this.testDataSource.getRepository(MessageTemplate);
		const templates: MessageTemplate[] = [];

		const templateTypes = ['WALKER_WELCOME', 'SERVER_WELCOME', 'GENERAL'];

		for (const type of templateTypes) {
			const template = templateRepository.create({
				retreatId,
				name: `Test ${type} Template`,
				type,
				message: `This is a test ${type.toLowerCase()} template content for retreat ${retreatId}.`,
			});
			templates.push(await templateRepository.save(template));
		}

		return templates;
	}

	/**
	 * Create a test community
	 */
	static async createTestCommunity(
		userId: string,
		overrides: Partial<Community> = {},
	): Promise<Community> {
		const communityRepository = this.testDataSource.getRepository(Community);
		const adminRepository = this.testDataSource.getRepository(CommunityAdmin);

		const defaultCommunity: Partial<Community> = {
			name: `Test Community ${Date.now()}`,
			address1: '456 Community Way',
			city: 'Community City',
			state: 'CM',
			zipCode: '54321',
			country: 'Test Country',
			createdBy: userId,
			...overrides,
		};
		const community = communityRepository.create(defaultCommunity);
		const savedCommunity = await communityRepository.save(community);

		// Add user as owner
		const admin = adminRepository.create({
			communityId: savedCommunity.id,
			userId,
			role: 'owner',
			status: 'active',
			acceptedAt: new Date(),
		});
		await adminRepository.save(admin);

		return savedCommunity;
	}

	/**
	 * Create a test community member
	 */
	static async createTestCommunityMember(
		communityId: string,
		participantId: string,
		overrides: Partial<CommunityMember> = {},
	): Promise<CommunityMember> {
		const memberRepository = this.testDataSource.getRepository(CommunityMember);
		const member = memberRepository.create({
			communityId,
			participantId,
			state: 'active_member' as any,
			...overrides,
		});
		return await memberRepository.save(member);
	}

	/**
	 * Create a test participant
	 */
	static async createTestParticipant(
		retreatId: string,
		overrides: Partial<Participant> = {},
	): Promise<Participant> {
		const participantRepository = this.testDataSource.getRepository(Participant);
		const defaultParticipant: Partial<Participant> = {
			id_on_retreat: Math.floor(Math.random() * 1000),
			firstName: 'Test',
			lastName: `Participant ${Date.now()}`,
			email: `participant-${Date.now()}@example.com`,
			type: 'walker' as any,
			birthDate: new Date('1990-01-01'),
			maritalStatus: 'S',
			street: 'Main St',
			houseNumber: '123',
			postalCode: '12345',
			neighborhood: 'Test Neighborhood',
			city: 'Test City',
			state: 'TS',
			country: 'Test Country',
			cellPhone: '1234567890',
			occupation: 'Test Occupation',
			snores: false,
			hasMedication: false,
			hasDietaryRestrictions: false,
			sacraments: [],
			emergencyContact1Name: 'Emergency Contact',
			emergencyContact1Relation: 'Friend',
			emergencyContact1CellPhone: '0987654321',
			retreatId,
			...overrides,
		};
		const participant = participantRepository.create(defaultParticipant);
		return await participantRepository.save(participant);
	}
	static async createCompleteTestEnvironment(
		userOverrides: Partial<User> = {},
		retreatOverrides: Partial<Retreat> = {},
	): Promise<{
		user: User;
		retreat: Retreat;
		tables: TableMesa[];
		beds: RetreatBed[];
		inventoryItems: InventoryItem[];
		retreatInventory: RetreatInventory[];
		messageTemplates: MessageTemplate[];
	}> {
		// Create test user
		const user = await this.createTestUser(userOverrides);

		// Create test retreat with createdBy set to the user
		const retreat = await this.createTestRetreat({
			...retreatOverrides,
			createdBy: user.id,
		});

		// Create tables
		const tables = await this.createTestTables(retreat.id, 5);

		// Create beds
		const beds = await this.createTestBeds(retreat.id, retreat.houseId!, 20);

		// Create inventory
		const inventoryItems = await this.createTestInventoryItems(10);
		const retreatInventory = await this.createRetreatInventory(retreat.id, inventoryItems);

		// Create message templates
		const messageTemplates = await this.createTestMessageTemplates(retreat.id);

		return {
			user,
			retreat,
			tables,
			beds,
			inventoryItems,
			retreatInventory,
			messageTemplates,
		};
	}

	/**
	 * Clean up all test data
	 */
	static async cleanupTestData(): Promise<void> {
		if (!this.testDataSource.isInitialized) {
			return;
		}

		// Clean up in order of dependencies to avoid foreign key constraints
		const entities = [
			'community_attendance',
			'community_meeting',
			'community_member',
			'community_admin',
			'community',
			'payment',
			'participant',
			'retreat_inventory',
			'retreat_bed',
			'table_mesa',
			'message_template',
			'retreat',
			'inventory_item',
			'house',
			'user',
		];

		for (const entityName of entities) {
			try {
				await this.testDataSource.query(`DELETE FROM ${entityName};`);
			} catch (error) {
				console.warn(`Warning: Could not clear table ${entityName}:`, error);
			}
		}
	}
}
