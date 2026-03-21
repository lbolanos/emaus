import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { TableMesa } from '@/entities/tableMesa.entity';
import { Participant } from '@/entities/participant.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
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
				retreatId: testRetreat?.id,
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

	// Helper to save a participant AND create a RetreatParticipant record
	const saveParticipantWithRetreatRole = async (
		participant: Participant,
		type: string,
		isCancelled = false,
	) => {
		const saved = await getTestDataSource().getRepository(Participant).save(participant);
		await getTestDataSource().getRepository(RetreatParticipant).save({
			participantId: saved.id,
			retreatId: testRetreat.id,
			roleInRetreat: type === 'server' ? 'server' : 'walker',
			type,
			isCancelled,
			isPrimaryRetreat: true,
		});
		return saved;
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
			});
			testWalkers.push(await saveParticipantWithRetreatRole(walker, 'walker'));
		}

		// Create test servers
		testServers = [];
		for (let i = 0; i < 3; i++) {
			const server = createTestParticipant({
				email: `server${i}@test.com`,
				firstName: `Server${i}`,
				lastName: `Test${i}`,
			});
			testServers.push(await saveParticipantWithRetreatRole(server, 'server'));
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
			const updatedTable = await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[0].id,
				'lider',
				getTestDataSource(),
			);

			expect(updatedTable.liderId).toBe(testServers[0].id);
			expect(updatedTable.lider?.id).toBe(testServers[0].id);
		});

		test('should assign colider1 to table', async () => {
			const updatedTable = await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[0].id,
				'colider1',
				getTestDataSource(),
			);

			expect(updatedTable.colider1Id).toBe(testServers[0].id);
		});

		test('should assign colider2 to table', async () => {
			const updatedTable = await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[0].id,
				'colider2',
				getTestDataSource(),
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
			});
			const saved = await saveParticipantWithRetreatRole(cancelledServer, 'server', true);

			await expect(
				tableMesaService.assignLeaderToTable(
					testTables[0].id,
					saved.id,
					'lider',
					getTestDataSource(),
				),
			).rejects.toThrow('Cannot assign cancelled participants as leaders');
		});

		test('should NOT remove walkers when assigning a leader to a table', async () => {
			const ds = getTestDataSource();
			// First assign walkers to the table
			await tableMesaService.assignWalkerToTable(testTables[0].id, testWalkers[0].id, ds);
			await tableMesaService.assignWalkerToTable(testTables[0].id, testWalkers[1].id, ds);
			await tableMesaService.assignWalkerToTable(testTables[0].id, testWalkers[2].id, ds);

			// Verify walkers are assigned
			let table = await tableMesaService.findTableById(testTables[0].id, ds);
			expect(table?.walkers?.length).toBe(3);

			// Now assign a leader
			const updatedTable = await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[0].id,
				'lider',
				ds,
			);

			// Walkers must still be there
			expect(updatedTable.walkers?.length).toBe(3);
			const walkerIds = updatedTable.walkers?.map((w: any) => w.id);
			expect(walkerIds).toContain(testWalkers[0].id);
			expect(walkerIds).toContain(testWalkers[1].id);
			expect(walkerIds).toContain(testWalkers[2].id);
			// And the leader should be assigned
			expect(updatedTable.lider?.id).toBe(testServers[0].id);
		});

		test('should NOT remove walkers when assigning colider to a table with walkers', async () => {
			const ds = getTestDataSource();
			// Assign walkers
			await tableMesaService.assignWalkerToTable(testTables[0].id, testWalkers[0].id, ds);
			await tableMesaService.assignWalkerToTable(testTables[0].id, testWalkers[1].id, ds);

			// Assign lider first
			await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[0].id,
				'lider',
				ds,
			);

			// Assign colider1
			const updatedTable = await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[1].id,
				'colider1',
				ds,
			);

			// Walkers must still be there
			expect(updatedTable.walkers?.length).toBe(2);
			expect(updatedTable.lider?.id).toBe(testServers[0].id);
			expect(updatedTable.colider1?.id).toBe(testServers[1].id);
		});

		test('should NOT remove walkers when moving a leader between tables', async () => {
			const ds = getTestDataSource();
			// Assign walkers to table 0
			await tableMesaService.assignWalkerToTable(testTables[0].id, testWalkers[0].id, ds);
			await tableMesaService.assignWalkerToTable(testTables[0].id, testWalkers[1].id, ds);

			// Assign walkers to table 1
			await tableMesaService.assignWalkerToTable(testTables[1].id, testWalkers[2].id, ds);

			// Assign leader to table 0
			await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[0].id,
				'lider',
				ds,
			);

			// Move leader from table 0 to table 1
			const updatedTable1 = await tableMesaService.assignLeaderToTable(
				testTables[1].id,
				testServers[0].id,
				'lider',
				ds,
			);

			// Table 1 walkers must still be there
			expect(updatedTable1.walkers?.length).toBe(1);
			expect(updatedTable1.walkers?.[0]?.id).toBe(testWalkers[2].id);
			expect(updatedTable1.lider?.id).toBe(testServers[0].id);

			// Table 0 walkers must still be there too
			const table0 = await tableMesaService.findTableById(testTables[0].id, ds);
			expect(table0?.walkers?.length).toBe(2);
			expect(table0?.lider).toBeFalsy(); // leader was moved away
		});

		test('should remove participant from previous leader role when assigning new role', async () => {
			const ds = getTestDataSource();
			// First assign as lider
			await tableMesaService.assignLeaderToTable(testTables[0].id, testServers[0].id, 'lider', ds);

			// Then assign same participant as colider1
			const updatedTable = await tableMesaService.assignLeaderToTable(
				testTables[0].id,
				testServers[0].id,
				'colider1',
				ds,
			);

			expect(updatedTable.liderId).toBeNull();
			expect(updatedTable.colider1Id).toBe(testServers[0].id);
		});
	});

	describe('unassignLeaderFromTable', () => {
		test('should unassign lider from table', async () => {
			// First assign a lider
			await tableMesaService.assignLeaderToTable(testTables[0].id, testServers[0].id, 'lider', getTestDataSource());

			// Then unassign
			const updatedTable = await tableMesaService.unassignLeaderFromTable(
				testTables[0].id,
				'lider',
				getTestDataSource(),
			);

			expect(updatedTable.liderId).toBeNull();
		});

		test('should unassign colider1 from table', async () => {
			await tableMesaService.assignLeaderToTable(testTables[0].id, testServers[0].id, 'colider1', getTestDataSource());

			const updatedTable = await tableMesaService.unassignLeaderFromTable(
				testTables[0].id,
				'colider1',
				getTestDataSource(),
			);

			expect(updatedTable.colider1Id).toBeNull();
		});

		test('should unassign colider2 from table', async () => {
			await tableMesaService.assignLeaderToTable(testTables[0].id, testServers[0].id, 'colider2', getTestDataSource());

			const updatedTable = await tableMesaService.unassignLeaderFromTable(
				testTables[0].id,
				'colider2',
				getTestDataSource(),
			);

			expect(updatedTable.colider2Id).toBeNull();
		});
	});

	describe('assignWalkerToTable', () => {
		test('should assign walker to table', async () => {
			const updatedTable = await tableMesaService.assignWalkerToTable(
				testTables[0].id,
				testWalkers[0].id,
				getTestDataSource(),
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
			});
			const saved = await saveParticipantWithRetreatRole(cancelledWalker, 'walker', true);

			await expect(
				tableMesaService.assignWalkerToTable(testTables[0].id, saved.id, getTestDataSource()),
			).rejects.toThrow('Cannot assign cancelled participants to tables');
		});
	});

	describe('unassignWalkerFromTable', () => {
		test('should unassign walker from table', async () => {
			// First assign a walker
			await tableMesaService.assignWalkerToTable(testTables[0].id, testWalkers[0].id, getTestDataSource());

			// Then unassign
			const updatedTable = await tableMesaService.unassignWalkerFromTable(
				testTables[0].id,
				testWalkers[0].id,
				getTestDataSource(),
			);

			const unassignedWalker = updatedTable.walkers?.find((w) => w.id === testWalkers[0].id);
			expect(unassignedWalker).toBeUndefined();
		});
	});

	describe('clearAllTablesForRetreat', () => {
		test('should unassign all walkers from all tables', async () => {
			const rpRepo = getTestDataSource().getRepository(RetreatParticipant);

			// Assign walkers to tables
			for (let i = 0; i < testWalkers.length; i++) {
				const tableIndex = i % testTables.length;
				await rpRepo.update(
					{ participantId: testWalkers[i].id, retreatId: testRetreat.id },
					{ tableId: testTables[tableIndex].id },
				);
			}

			// Verify walkers are assigned
			const assignedBefore = await rpRepo.count({
				where: { retreatId: testRetreat.id, tableId: testTables[0].id },
			});
			expect(assignedBefore).toBeGreaterThan(0);

			// Clear all tables
			await tableMesaService.clearAllTablesForRetreat(testRetreat.id, getTestDataSource());

			// Verify all walkers are unassigned
			const tables = await tableMesaService.findTablesByRetreatId(
				testRetreat.id,
				getTestDataSource(),
			);
			for (const table of tables) {
				expect(table.walkers?.length || 0).toBe(0);
			}
		});

		test('should unassign all leaders from all tables', async () => {
			const tableMesaRepo = getTestDataSource().getRepository(TableMesa);

			// Assign leaders to tables
			await tableMesaRepo.update(testTables[0].id, { liderId: testServers[0].id });
			await tableMesaRepo.update(testTables[1].id, {
				colider1Id: testServers[1].id,
				colider2Id: testServers[2].id,
			});

			// Clear all tables
			await tableMesaService.clearAllTablesForRetreat(testRetreat.id, getTestDataSource());

			// Verify all leaders are unassigned (findTablesByRetreatId returns Zod-parsed objects)
			const tables = await tableMesaService.findTablesByRetreatId(
				testRetreat.id,
				getTestDataSource(),
			);
			for (const table of tables) {
				expect(table.lider).toBeFalsy();
				expect(table.colider1).toBeFalsy();
				expect(table.colider2).toBeFalsy();
			}
		});

		test('should clear both walkers and leaders simultaneously', async () => {
			const rpRepo = getTestDataSource().getRepository(RetreatParticipant);
			const tableMesaRepo = getTestDataSource().getRepository(TableMesa);

			// Assign walkers
			for (const walker of testWalkers) {
				await rpRepo.update(
					{ participantId: walker.id, retreatId: testRetreat.id },
					{ tableId: testTables[0].id },
				);
			}

			// Assign leaders
			await tableMesaRepo.update(testTables[0].id, {
				liderId: testServers[0].id,
				colider1Id: testServers[1].id,
			});

			// Clear all
			await tableMesaService.clearAllTablesForRetreat(testRetreat.id, getTestDataSource());

			// Verify everything is cleared
			const tables = await tableMesaService.findTablesByRetreatId(
				testRetreat.id,
				getTestDataSource(),
			);
			for (const table of tables) {
				expect(table.walkers?.length || 0).toBe(0);
				expect(table.lider).toBeFalsy();
				expect(table.colider1).toBeFalsy();
				expect(table.colider2).toBeFalsy();
			}
		});

		test('should not delete tables themselves', async () => {
			const tableCountBefore = testTables.length;

			await tableMesaService.clearAllTablesForRetreat(testRetreat.id, getTestDataSource());

			const tables = await tableMesaService.findTablesByRetreatId(
				testRetreat.id,
				getTestDataSource(),
			);
			expect(tables.length).toBe(tableCountBefore);
		});

		test('should not affect tables in other retreats', async () => {
			const { Retreat } = await import('@/entities/retreat.entity');
			const { House } = await import('@/entities/house.entity');
			const rpRepo = getTestDataSource().getRepository(RetreatParticipant);
			const tableMesaRepo = getTestDataSource().getRepository(TableMesa);

			// Create a second retreat with its own table and participants
			const houseRepo = getTestDataSource().getRepository(House);
			const house = await houseRepo.save(
				houseRepo.create({
					name: 'Other House',
					address1: '456 Other St',
					city: 'Other City',
					state: 'OS',
					zipCode: '54321',
					country: 'Other Country',
					capacity: 30,
				}),
			);

			const retreatRepo = getTestDataSource().getRepository(Retreat);
			const otherRetreat = await retreatRepo.save(
				retreatRepo.create({
					parish: 'Other Retreat',
					startDate: new Date(),
					endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
					houseId: house.id,
				}),
			);

			const otherTable = await tableMesaService.createTable(
				{ name: 'Other Table', retreatId: otherRetreat.id },
				getTestDataSource(),
			);

			// Assign a leader to the other retreat's table
			const otherServer = createTestParticipant({
				email: 'other-server@test.com',
				firstName: 'Other',
				lastName: 'Server',
			});
			const savedServer = await getTestDataSource().getRepository(Participant).save(otherServer);
			await rpRepo.save({
				participantId: savedServer.id,
				retreatId: otherRetreat.id,
				roleInRetreat: 'server',
				type: 'server',
				isCancelled: false,
				isPrimaryRetreat: true,
				tableId: otherTable.id,
			});
			await tableMesaRepo.update(otherTable.id, { liderId: savedServer.id });

			// Clear the FIRST retreat's tables
			await tableMesaService.clearAllTablesForRetreat(testRetreat.id, getTestDataSource());

			// Verify the other retreat's table is untouched
			const otherTables = await tableMesaService.findTablesByRetreatId(
				otherRetreat.id,
				getTestDataSource(),
			);
			expect(otherTables[0].lider?.id).toBe(savedServer.id);

			const otherRp = await rpRepo.findOne({
				where: { participantId: savedServer.id, retreatId: otherRetreat.id },
			});
			expect(otherRp?.tableId).toBe(otherTable.id);
		});

		test('should handle empty retreat with no assignments', async () => {
			// Just clear — should not throw
			await expect(
				tableMesaService.clearAllTablesForRetreat(testRetreat.id, getTestDataSource()),
			).resolves.not.toThrow();
		});
	});

	describe('rebalanceTablesForRetreat', () => {
		test('should distribute walkers evenly across tables', async () => {
			// Assign all walkers to first table via retreat_participants
			const rpRepo = getTestDataSource().getRepository(RetreatParticipant);
			for (const walker of testWalkers) {
				await rpRepo.update(
					{ participantId: walker.id, retreatId: testRetreat.id },
					{ tableId: testTables[0].id },
				);
			}

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
			for (let i = 0; i < 50; i++) {
				const walker = createTestParticipant({
					email: `many-walker-${i}@test.com`,
					firstName: `Walker${i}`,
					lastName: 'Many',
				});
				await saveParticipantWithRetreatRole(walker, 'walker');
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
