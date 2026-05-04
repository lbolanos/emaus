import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Participant } from '@/entities/participant.entity';
import { Responsability } from '@/entities/responsability.entity';
import { ServiceTeam } from '@/entities/serviceTeam.entity';
import { ServiceTeamMember } from '@/entities/serviceTeamMember.entity';
import { ServiceTeamType } from '@repo/types';
import * as responsabilityService from '@/services/responsabilityService';
import * as serviceTeamService from '@/services/serviceTeamService';
import { v4 as uuidv4 } from 'uuid';

describe('Leader Sync Service', () => {
	let testRetreat: any;

	const getDS = () => TestDataFactory['testDataSource'];

	const createServer = async (overrides: Partial<Participant> = {}) => {
		const ds = getDS();
		const participant = ds.getRepository(Participant).create({
			email: `server-${Date.now()}-${Math.random()}@test.com`,
			firstName: 'Test',
			lastName: 'Server',
			type: 'server',
			retreatId: testRetreat.id,
			birthDate: new Date('1990-01-01'),
			maritalStatus: 'single',
			street: '123 St',
			houseNumber: '1',
			postalCode: '12345',
			neighborhood: 'Test',
			city: 'Test City',
			state: 'TS',
			country: 'MX',
			cellPhone: '1234567890',
			occupation: 'Tester',
			snores: false,
			hasMedication: false,
			hasDietaryRestrictions: false,
			sacraments: [],
			isScholarship: false,
			registrationDate: new Date(),
			lastUpdatedDate: new Date(),
			emergencyContact1Name: 'EC',
			emergencyContact1Relation: 'Spouse',
			emergencyContact1CellPhone: '0987654321',
			...overrides,
		});
		return ds.getRepository(Participant).save(participant);
	};

	const createResponsibility = async (name: string) => {
		const ds = getDS();
		const resp = ds.getRepository(Responsability).create({
			id: uuidv4(),
			name,
			retreatId: testRetreat.id,
		});
		return ds.getRepository(Responsability).save(resp);
	};

	const createServiceTeam = async (name: string, teamType: ServiceTeamType) => {
		const ds = getDS();
		const team = ds.getRepository(ServiceTeam).create({
			id: uuidv4(),
			name,
			teamType,
			retreatId: testRetreat.id,
			priority: 0,
			isActive: true,
		});
		return ds.getRepository(ServiceTeam).save(team);
	};

	beforeAll(async () => {
		await setupTestDatabase();
		testRetreat = await TestDataFactory.createTestRetreat();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		const ds = getDS();
		await ds.getRepository(ServiceTeamMember).clear();
		await ds.getRepository(ServiceTeam).clear();
		await ds.getRepository(Responsability).clear();
	});

	describe('Responsibility → Service Team sync', () => {
		it('should set service team leader when assigning participant to responsibility', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Maria', lastName: 'Lopez' });
			const resp = await createResponsibility('Música');
			const team = await createServiceTeam('Música y Alabanza', ServiceTeamType.MUSICA);

			await responsabilityService.assignResponsabilityToParticipant(
				resp.id,
				server.id,
				ds,
			);

			const updatedTeam = await ds.getRepository(ServiceTeam).findOne({
				where: { id: team.id },
			});
			expect(updatedTeam?.leaderId).toBe(server.id);
		});

		it('should clear service team leader when unassigning participant from responsibility', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Juan', lastName: 'Perez' });
			const resp = await createResponsibility('Transporte');
			const team = await createServiceTeam('Transporte', ServiceTeamType.TRANSPORTE);

			// Assign first
			await responsabilityService.assignResponsabilityToParticipant(
				resp.id,
				server.id,
				ds,
			);

			// Verify leader was set
			let updatedTeam = await ds.getRepository(ServiceTeam).findOne({
				where: { id: team.id },
			});
			expect(updatedTeam?.leaderId).toBe(server.id);

			// Unassign
			await responsabilityService.removeResponsabilityFromParticipant(
				resp.id,
				server.id,
				ds,
			);

			updatedTeam = await ds.getRepository(ServiceTeam).findOne({
				where: { id: team.id },
			});
			expect(updatedTeam?.leaderId).toBeNull();
		});

		it('should not sync when responsibility has no team mapping', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Ana', lastName: 'Garcia' });
			const resp = await createResponsibility('Inventario');

			// This should not throw
			const result = await responsabilityService.assignResponsabilityToParticipant(
				resp.id,
				server.id,
				ds,
			);
			expect(result).not.toBeNull();
		});

		it('should also add leader as team member', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Pedro', lastName: 'Ramirez' });
			await createResponsibility('Snacks');
			const team = await createServiceTeam('Snacks', ServiceTeamType.SNACKS);
			const resp = await ds.getRepository(Responsability).findOne({
				where: { name: 'Snacks', retreatId: testRetreat.id },
			});

			await responsabilityService.assignResponsabilityToParticipant(
				resp!.id,
				server.id,
				ds,
			);

			const members = await ds.getRepository(ServiceTeamMember).find({
				where: { serviceTeamId: team.id },
			});
			expect(members.length).toBe(1);
			expect(members[0].participantId).toBe(server.id);
			expect(members[0].role).toBe('líder');
		});
	});

	describe('Service Team → Responsibility sync', () => {
		it('should set responsibility participant when assigning service team leader', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Luis', lastName: 'Hernandez' });
			const resp = await createResponsibility('Comedor');
			const team = await createServiceTeam('Cocina / Comedor', ServiceTeamType.COCINA);

			await serviceTeamService.assignLeader(team.id, server.id, undefined, ds);

			const updatedResp = await ds.getRepository(Responsability).findOne({
				where: { id: resp.id },
			});
			expect(updatedResp?.participantId).toBe(server.id);
		});

		it('should clear responsibility participant when unassigning service team leader', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Rosa', lastName: 'Martinez' });
			const resp = await createResponsibility('Oración de Intercesión');
			const team = await createServiceTeam('Intercesión / Oración', ServiceTeamType.ORACION);

			// Assign leader
			await serviceTeamService.assignLeader(team.id, server.id, undefined, ds);

			let updatedResp = await ds.getRepository(Responsability).findOne({
				where: { id: resp.id },
			});
			expect(updatedResp?.participantId).toBe(server.id);

			// Unassign leader
			await serviceTeamService.unassignLeader(team.id, ds);

			updatedResp = await ds.getRepository(Responsability).findOne({
				where: { id: resp.id },
			});
			expect(updatedResp?.participantId).toBeNull();
		});

		it('should not sync when team type has no responsibility mapping', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Carlos', lastName: 'Diaz' });
			const team = await createServiceTeam('Liturgia', ServiceTeamType.LITURGIA);

			// Should not throw
			const result = await serviceTeamService.assignLeader(
				team.id,
				server.id,
				undefined,
				ds,
			);
			expect(result).not.toBeNull();
		});
	});

	describe('Bidirectional sync - no infinite loops', () => {
		it('should not create infinite loop when syncing both directions', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Elena', lastName: 'Torres' });
			const resp = await createResponsibility('Salón');
			const team = await createServiceTeam('Salón', ServiceTeamType.SALON);

			// Assign via responsibility - should sync to team but NOT back
			await responsabilityService.assignResponsabilityToParticipant(
				resp.id,
				server.id,
				ds,
			);

			const updatedTeam = await ds.getRepository(ServiceTeam).findOne({
				where: { id: team.id },
			});
			const updatedResp = await ds.getRepository(Responsability).findOne({
				where: { id: resp.id },
			});

			expect(updatedTeam?.leaderId).toBe(server.id);
			expect(updatedResp?.participantId).toBe(server.id);
		});

		it('should handle bidirectional sync from team side', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Diego', lastName: 'Ruiz' });
			const resp = await createResponsibility('Cuartos');
			const team = await createServiceTeam('Cuartos', ServiceTeamType.CUARTOS);

			// Assign via team - should sync to responsibility but NOT back
			await serviceTeamService.assignLeader(team.id, server.id, undefined, ds);

			const updatedTeam = await ds.getRepository(ServiceTeam).findOne({
				where: { id: team.id },
			});
			const updatedResp = await ds.getRepository(Responsability).findOne({
				where: { id: resp.id },
			});

			expect(updatedTeam?.leaderId).toBe(server.id);
			expect(updatedResp?.participantId).toBe(server.id);
		});
	});

	describe('Palanquero mapping', () => {
		it('should set Palancas team leader when assigning any Palanquero responsibility', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Miguel', lastName: 'Soto' });
			await createResponsibility('Palanquero 1');
			await createResponsibility('Palanquero 2');
			const resp2 = await ds.getRepository(Responsability).findOne({
				where: { name: 'Palanquero 2', retreatId: testRetreat.id },
			});
			const team = await createServiceTeam('Palancas', ServiceTeamType.PALANCAS);

			await responsabilityService.assignResponsabilityToParticipant(
				resp2!.id,
				server.id,
				ds,
			);

			const updatedTeam = await ds.getRepository(ServiceTeam).findOne({
				where: { id: team.id },
			});
			expect(updatedTeam?.leaderId).toBe(server.id);
		});

		it('should set Palanquero 1 when assigning Palancas team leader', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Sofia', lastName: 'Vega' });
			const resp1 = await createResponsibility('Palanquero 1');
			await createResponsibility('Palanquero 2');
			const team = await createServiceTeam('Palancas', ServiceTeamType.PALANCAS);

			await serviceTeamService.assignLeader(team.id, server.id, undefined, ds);

			const updatedResp = await ds.getRepository(Responsability).findOne({
				where: { id: resp1.id },
			});
			expect(updatedResp?.participantId).toBe(server.id);
		});
	});

	describe('removeMember clears leader and syncs', () => {
		it('should clear responsibility when removing a member who was leader', async () => {
			const ds = getDS();
			const server = await createServer({ firstName: 'Pablo', lastName: 'Cruz' });
			const resp = await createResponsibility('Logistica');
			const team = await createServiceTeam('Logística', ServiceTeamType.LOGISTICA);

			// Assign as leader
			await serviceTeamService.assignLeader(team.id, server.id, undefined, ds);

			// Verify synced
			let updatedResp = await ds.getRepository(Responsability).findOne({
				where: { id: resp.id },
			});
			expect(updatedResp?.participantId).toBe(server.id);

			// Remove member (who is also leader)
			await serviceTeamService.removeMember(team.id, server.id, ds);

			// Verify leader cleared
			const updatedTeam = await ds.getRepository(ServiceTeam).findOne({
				where: { id: team.id },
			});
			expect(updatedTeam?.leaderId).toBeNull();

			// Verify responsibility unassigned
			updatedResp = await ds.getRepository(Responsability).findOne({
				where: { id: resp.id },
			});
			expect(updatedResp?.participantId).toBeNull();
		});
	});
});
