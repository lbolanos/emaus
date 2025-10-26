import { AppDataSource } from '../../data-source';
import { User } from '../entities/user.entity';
import { Retreat } from '../entities/retreat.entity';
import { House } from '../entities/house.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { RetreatBed, BedUsage, BedType } from '../entities/retreatBed.entity';
import { InventoryItem } from '../entities/inventoryItem.entity';
import { RetreatInventory } from '../entities/retreatInventory.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import * as bcrypt from 'bcrypt';

/**
 * Test data factory for creating test entities for Excel import testing
 */
export class TestDataFactory {
  private static testDataSource = AppDataSource;

  /**
   * Create a test user with specified role
   */
  static async createTestUser(overrides: Partial<User> = {}): Promise<User> {
    const userRepository = this.testDataSource.getRepository(User);

    const defaultUser = {
      firstName: 'Test',
      lastName: 'User',
      email: `test-${Date.now()}@example.com`,
      password: await bcrypt.hash('password123', 10),
      role: 'admin',
      isActive: true,
      emailVerified: true,
      ...overrides
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
      address: '123 Test Street',
      city: 'Test City',
      state: 'Test State',
      country: 'Test Country',
      maxOccupancy: 100,
      notes: 'Test house for Excel import testing'
    });
    const savedHouse = await houseRepository.save(house);

    const defaultRetreat = {
      name: `Test Retreat ${Date.now()}`,
      startDate: new Date(),
      endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      isPublic: true,
      max_walkers: 50,
      max_servers: 20,
      houseId: savedHouse.id,
      notes: 'Test retreat for Excel import testing',
      ...overrides
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
        maxWalkers: 8
      });
      tables.push(await tableRepository.save(table));
    }

    return tables;
  }

  /**
   * Create test beds for a retreat house
   */
  static async createTestBeds(retreatId: string, houseId: string, count: number = 20): Promise<RetreatBed[]> {
    const retreatBedRepository = this.testDataSource.getRepository(RetreatBed);
    const beds: RetreatBed[] = [];

    for (let i = 1; i <= count; i++) {
      const bed = retreatBedRepository.create({
        roomNumber: `${Math.ceil(i / 4)}`, // 4 beds per room
        bedNumber: `${((i - 1) % 4) + 1}`,
        floor: Math.ceil(i / 10), // Floors 1-2
        type: i % 3 === 0 ? BedType.LITERA : BedType.NORMAL,
        defaultUsage: i % 2 === 0 ? BedUsage.CAMINANTE : BedUsage.SERVIDOR,
        retreatId,
        houseId
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
    const items: InventoryItem[] = [];

    for (let i = 1; i <= count; i++) {
      const item = inventoryRepository.create({
        name: `Test Item ${i}`,
        description: `Description for test item ${i}`,
        category: 'Test Category',
        unit: 'pieces',
        isActive: true
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
    items: InventoryItem[]
  ): Promise<RetreatInventory[]> {
    const retreatInventoryRepository = this.testDataSource.getRepository(RetreatInventory);
    const inventory: RetreatInventory[] = [];

    for (const item of items) {
      const retreatItem = retreatInventoryRepository.create({
        retreatId,
        itemId: item.id,
        quantity: Math.floor(Math.random() * 50) + 10, // 10-60 items
        walkerToItemRatio: 2
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
        type,
        subject: `Test ${type} Template`,
        content: `This is a test ${type.toLowerCase()} template content for retreat ${retreatId}.`,
        isActive: true
      });
      templates.push(await templateRepository.save(template));
    }

    return templates;
  }

  /**
   * Create a complete test environment with all necessary entities
   */
  static async createCompleteTestEnvironment(
    userOverrides: Partial<User> = {},
    retreatOverrides: Partial<Retreat> = {}
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

    // Create test retreat
    const retreat = await this.createTestRetreat(retreatOverrides);

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
      messageTemplates
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
      'payment',
      'participant',
      'retreat_inventory',
      'retreat_bed',
      'table_mesa',
      'message_template',
      'retreat',
      'inventory_item',
      'house',
      'user'
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