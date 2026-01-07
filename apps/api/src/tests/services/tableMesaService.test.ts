import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { TableMesa } from '@/entities/tableMesa.entity';
import { Participant } from '@/entities/participant.entity';
import * as tableMesaService from '@/services/tableMesaService';

/**
 * Table Mesa Service Tests
 *
 * All services have been refactored to accept an optional `dataSource?: DataSource` parameter.
 * Tests now pass the testDataSource to service calls, allowing proper test database isolation.
 */
describe('Table Mesa Service', () => {
	let testRetreat: any;
	let testTables: TableMesa[];
	let testWalkers: Participant[];
	let testServers: Participant[];

	// Helper to get testDataSource
	const getTestDataSource = () => TestDataFactory['testDataSource'];

	// Helper to create a minimal participant with all required fields
	const createTestParticipant = (overrides: Partial<Participant> = {}) => {
		return getTestDataSource()
			.getRepository(Participant)
			.create({
				email: 'test@example.com',
				firstName: 'Test',
				lastName: 'Participant',
				type: 'walker',
				retreatId: testRetreat.id,
				isCancelled: false,
				id_on_retreat: 1,
				birthDate: new Date('1990-01-01'),
				maritalStatus: 'single',
				street: '123 Test St',
				houseNumber: '1',
				postalCode: '12345',
				neighborhood: 'Test Neighborhood',
				city: 'Test City',
				state: 'Test State',
				country: 'Test Country',
				cellPhone: '1234567890',
				occupation: 'Test Occupation',
				snores: false,
				hasMedication: false,
				hasDietaryRestrictions: false,
				sacraments: [],
				isScholarship: false,
				registrationDate: new Date(),
				lastUpdatedDate: new Date(),
				emergencyContact1Name: 'Emergency Contact',
				emergencyContact1Relation: 'Spouse',
				emergencyContact1CellPhone: '0987654321',
				...overrides,
			});
	};

	beforeAll(async () => {
		await setupTestDatabase();
		const env = await TestDataFactory.createCompleteTestEnvironment();
		testRetreat = env.retreat;
		testTables = env.tables;
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Recreate test environment
		const env = await TestDataFactory.createCompleteTestEnvironment();
		testRetreat = env.retreat;
		testTables = await tableMesaService.findTablesByRetreatId(testRetreat.id, getTestDataSource());

		// Create test walkers
		testWalkers = [];
		for (let i = 0; i < 5; i++) {
			const walker = createTestParticipant({
				email: `walker${i}@test.com`,
				firstName: `Walker${i}`,
				lastName: `Test${i}`,
				type: 'walker',
				id_on_retreat: i + 1,
			});
			testWalkers.push(await getTestDataSource().getRepository(Participant).save(walker));
		}

		// Create test servers
		testServers = [];
		for (let i = 0; i < 3; i++) {
			const server = createTestParticipant({
				email: `server${i}@test.com`,
				firstName: `Server${i}`,
				lastName: `Test${i}`,
				type: 'server',
				id_on_retreat: i + 100,
			});
			testServers.push(await getTestDataSource().getRepository(Participant).save(server));
		}
	});

	describe('findTablesByRetreatId', () => {
		test('should return all tables for retreat with relations', async () => {
			const tables = await tableMesaService.findTablesByRetreatId(
				testRetreat.id,
				getTestDataSource(),
			);

			expect(Array.isArray(tables)).toBe(true);
			expect(tables.length).toBeGreaterThan(0);
			expect(tables[0]).toHaveProperty('lider');
			expect(tables[0]).toHaveProperty('colider1');
			expect(tables[0]).toHaveProperty('colider2');
			expect(tables[0]).toHaveProperty('walkers');
		});

		test('should return tables ordered by name ascending', async () => {
			const tables = await tableMesaService.findTablesByRetreatId(
				testRetreat.id,
				getTestDataSource(),
			);

			for (let i = 1; i < tables.length; i++) {
				expect(tables[i - 1].name.localeCompare(tables[i].name)).toBeLessThanOrEqual(0);
			}
		});

		test('should return empty array for non-existent retreat', async () => {
			const tables = await tableMesaService.findTablesByRetreatId(
				'non-existent-id',
				getTestDataSource(),
			);

			expect(tables).toEqual([]);
		});
	});

	describe('findTableById', () => {
		test('should return table with all relations by id', async () => {
			const table = await tableMesaService.findTableById(testTables[0].id, getTestDataSource());

			expect(table).toBeTruthy();
			expect(table?.id).toBe(testTables[0].id);
			expect(table?.lider).toBeDefined();
			expect(table?.colider1).toBeDefined();
			expect(table?.colider2).toBeDefined();
			expect(table?.walkers).toBeDefined();
		});

		test('should return null for non-existent table', async () => {
			const table = await tableMesaService.findTableById('non-existent-id', getTestDataSource());

			expect(table).toBeNull();
		});
	});

	describe('createTable', () => {
		test('should create table with valid data', async () => {
			const tableData = {
				name: 'Test Table 6',
				retreatId: testRetreat.id,
			};

			const newTable = await tableMesaService.createTable(tableData, getTestDataSource());

			expect(newTable).toBeTruthy();
			expect(newTable.name).toBe(tableData.name);
			expect(newTable.retreatId).toBe(tableData.retreatId);
		});

		test('should create multiple tables for same retreat', async () => {
			const tableNames = ['Table 10', 'Table 11', 'Table 12'];

			for (const name of tableNames) {
				await tableMesaService.createTable(
					{ name, retreatId: testRetreat.id },
					getTestDataSource(),
				);
			}

			const tables = await tableMesaService.findTablesByRetreatId(
				testRetreat.id,
				getTestDataSource(),
			);
			const createdTables = tables.filter((t) => tableNames.includes(t.name));

			expect(createdTables).toHaveLength(3);
		});
	});

	describe('createDefaultTablesForRetreat', () => {
		test('should create 5 default tables for new retreat', async () => {
			const { Retreat } = await import('@/entities/retreat.entity');
			const { House } = await import('@/entities/house.entity');

			// Create a new retreat
			const retreatRepository = TestDataFactory['testDataSource'].getRepository(Retreat);
			const houseRepository = TestDataFactory['testDataSource'].getRepository(House);

			const house = houseRepository.create({
				name: 'Default Tables House',
				address1: '123 Test St',
				city: 'Test City',
				state: 'TS',
				zipCode: '12345',
				country: 'Test Country',
				capacity: 50,
			});
			const savedHouse = await houseRepository.save(house);

			const retreat = retreatRepository.create({
				parish: 'Default Tables Retreat',
				startDate: new Date(),
				endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
				houseId: savedHouse.id,
			});
			const savedRetreat = await retreatRepository.save(retreat);

			await tableMesaService.createDefaultTablesForRetreat(savedRetreat, getTestDataSource());

			const tables = await tableMesaService.findTablesByRetreatId(
				savedRetreat.id,
				getTestDataSource(),
			);
			expect(tables).toHaveLength(5);

			const tableNames = tables.map((t) => t.name);
			expect(tableNames).toContain('Table 1');
			expect(tableNames).toContain('Table 2');
			expect(tableNames).toContain('Table 3');
			expect(tableNames).toContain('Table 4');
			expect(tableNames).toContain('Table 5');
		});
	});

	describe('updateTable', () => {
		test('should update table name', async () => {
			const newName = 'Updated Table Name';
			const updatedTable = await tableMesaService.updateTable(
				testTables[0].id,
				{
					name: newName,
				},
				getTestDataSource(),
			);

			expect(updatedTable).toBeTruthy();
			expect(updatedTable?.name).toBe(newName);
		});

		test('should return null when updating non-existent table', async () => {
			const result = await tableMesaService.updateTable(
				'non-existent-id',
				{
					name: 'New Name',
				},
				getTestDataSource(),
			);

			expect(result).toBeNull();
		});
	});

	describe('deleteTable', () => {
		test('should delete table successfully', async () => {
			const newTable = await tableMesaService.createTable({
				name: 'Table to Delete',
				retreatId: testRetreat.id,
			});

			await tableMesaService.deleteTable(newTable.id, getTestDataSource());

			const deletedTable = await tableMesaService.findTableById(newTable.id, getTestDataSource());
			expect(deletedTable).toBeNull();
		});
	});

	describe('assignLeaderToTable', () => {
		test('should assign lider to table', async () => {
			const table = await tableMesaService.findTableById(testTables[0].id, getTestDataSource());
			const updatedTable = await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[0].id,
				'lider',
			);

			expect(updatedTable.liderId).toBe(testServers[0].id);
			expect(updatedTable.lider?.id).toBe(testServers[0].id);
		});

		test('should assign colider1 to table', async () => {
			const updatedTable = await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[0].id,
				'colider1',
			);

			expect(updatedTable.colider1Id).toBe(testServers[0].id);
		});

		test('should assign colider2 to table', async () => {
			const updatedTable = await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[0].id,
				'colider2',
			);

			expect(updatedTable.colider2Id).toBe(testServers[0].id);
		});

		test('should reject assigning walker as leader', async () => {
			await expect(
				tableMesaService.assignLeaderToTable(
					testTables[0].id,
					testWalkers[0].id,
					'lider',
					getTestDataSource(),
				),
			).rejects.toThrow('Only servers can be assigned as leaders');
		});

		test('should reject assigning cancelled participant as leader', async () => {
			const cancelledServer = createTestParticipant({
				email: 'cancelled-server@test.com',
				firstName: 'Cancelled',
				lastName: 'Server',
				type: 'server',
				isCancelled: true,
				id_on_retreat: 999,
			});
			const saved = await TestDataFactory['testDataSource']
				.getRepository(Participant)
				.save(cancelledServer);

			await expect(
				tableMesaService.assignLeaderToTable(
					testTables[0].id,
					saved.id,
					'lider',
					getTestDataSource(),
				),
			).rejects.toThrow('Cannot assign cancelled participants as leaders');
		});

		test('should remove participant from previous leader role when assigning new role', async () => {
			// First assign as lider
			await tableMesaService.assignLeaderToTable(testTables[0].id, testServers[0].id, 'lider');

			// Then assign same participant as colider1
			const updatedTable = await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[0].id,
				'colider1',
			);

			expect(updatedTable.liderId).toBeNull();
			expect(updatedTable.colider1Id).toBe(testServers[0].id);
		});
	});

	describe('unassignLeaderFromTable', () => {
		test('should unassign lider from table', async () => {
			// First assign a lider
			await tableMesaService.assignLeaderToTable(testTables[0].id, testServers[0].id, 'lider');

			// Then unassign
			const updatedTable = await tableMesaService.unassignLeaderFromTable(
				testTables[0].id,
				'lider',
			);

			expect(updatedTable.liderId).toBeNull();
		});

		test('should unassign colider1 from table', async () => {
			await tableMesaService.assignLeaderToTable(testTables[0].id, testServers[0].id, 'colider1');

			const updatedTable = await tableMesaService.unassignLeaderFromTable(
				testTables[0].id,
				'colider1',
			);

			expect(updatedTable.colider1Id).toBeNull();
		});

		test('should unassign colider2 from table', async () => {
			await tableMesaService.assignLeaderToTable(testTables[0].id, testServers[0].id, 'colider2');

			const updatedTable = await tableMesaService.unassignLeaderFromTable(
				testTables[0].id,
				'colider2',
			);

			expect(updatedTable.colider2Id).toBeNull();
		});
	});

	describe('assignWalkerToTable', () => {
		test('should assign walker to table', async () => {
			const updatedTable = await tableMesaService.assignWalkerToTable(
				testTables[0].id,
				testWalkers[0].id,
			);

			const assignedWalker = updatedTable.walkers?.find((w) => w.id === testWalkers[0].id);
			expect(assignedWalker).toBeDefined();
		});

		test('should reject assigning server as walker', async () => {
			await expect(
				tableMesaService.assignWalkerToTable(
					testTables[0].id,
					testServers[0].id,
					getTestDataSource(),
				),
			).rejects.toThrow('Only walkers can be assigned to a table');
		});

		test('should reject assigning cancelled participant as walker', async () => {
			const cancelledWalker = createTestParticipant({
				email: 'cancelled-walker@test.com',
				firstName: 'Cancelled',
				lastName: 'Walker',
				type: 'walker',
				isCancelled: true,
				id_on_retreat: 998,
			});
			const saved = await TestDataFactory['testDataSource']
				.getRepository(Participant)
				.save(cancelledWalker);

			await expect(
				tableMesaService.assignWalkerToTable(testTables[0].id, saved.id, getTestDataSource()),
			).rejects.toThrow('Cannot assign cancelled participants to tables');
		});
	});

	describe('unassignWalkerFromTable', () => {
		test('should unassign walker from table', async () => {
			// First assign a walker
			await tableMesaService.assignWalkerToTable(testTables[0].id, testWalkers[0].id);

			// Then unassign
			const updatedTable = await tableMesaService.unassignWalkerFromTable(
				testTables[0].id,
				testWalkers[0].id,
			);

			const unassignedWalker = updatedTable.walkers?.find((w) => w.id === testWalkers[0].id);
			expect(unassignedWalker).toBeUndefined();
		});
	});

	describe('rebalanceTablesForRetreat', () => {
		test('should distribute walkers evenly across tables', async () => {
			// Assign all walkers to first table
			for (const walker of testWalkers) {
				walker.tableId = testTables[0].id;
			}
			await TestDataFactory['testDataSource'].getRepository(Participant).save(testWalkers);

			// Rebalance
			await tableMesaService.rebalanceTablesForRetreat(testRetreat.id, getTestDataSource());

			// Check distribution
			const tables = await tableMesaService.findTablesByRetreatId(
				testRetreat.id,
				getTestDataSource(),
			);
			const walkerCounts = tables.map((t) => t.walkers?.length || 0);

			// All walkers should be distributed
			const totalWalkers = walkerCounts.reduce((a, b) => a + b, 0);
			expect(totalWalkers).toBe(testWalkers.length);
		});

		test('should create new tables if needed', async () => {
			// Create many walkers (more than 5 tables * 7 max walkers = 35)
			const manyWalkers: Participant[] = [];
			for (let i = 0; i < 50; i++) {
				const walker = createTestParticipant({
					email: `many-walker-${i}@test.com`,
					firstName: `Walker${i}`,
					lastName: 'Many',
					type: 'walker',
					id_on_retreat: 1000 + i,
				});
				manyWalkers.push(
					await TestDataFactory['testDataSource'].getRepository(Participant).save(walker),
				);
			}

			await tableMesaService.rebalanceTablesForRetreat(testRetreat.id, getTestDataSource());

			const tables = await tableMesaService.findTablesByRetreatId(
				testRetreat.id,
				getTestDataSource(),
			);
			// Should create more tables to accommodate all walkers
			expect(tables.length).toBeGreaterThan(5);
		});
	});
});
