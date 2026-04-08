import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Participant } from '@/entities/participant.entity';
import { Responsability } from '@/entities/responsability.entity';
import { ServiceTeam } from '@/entities/serviceTeam.entity';
import { ServiceTeamMember } from '@/entities/serviceTeamMember.entity';
import * as responsabilityService from '@/services/responsabilityService';
import { v4 as uuidv4 } from 'uuid';

describe('Multiple responsibilities per server', () => {
	let testRetreat: any;

	const getDS = () => TestDataFactory['testDataSource'];

	const createServer = async (firstName: string, lastName: string) => {
		const ds = getDS();
		const participant = ds.getRepository(Participant).create({
			email: `server-${Date.now()}-${Math.random()}@test.com`,
			firstName,
			lastName,
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

	it('should allow the same server to be assigned to two different responsibilities', async () => {
		const ds = getDS();
		const juan = await createServer('Juan', 'Perez');
		const palancas = await createResponsibility('Palancas');
		const snacks = await createResponsibility('Snacks');

		await responsabilityService.assignResponsabilityToParticipant(palancas.id, juan.id, ds);
		await responsabilityService.assignResponsabilityToParticipant(snacks.id, juan.id, ds);

		const assignments = await ds.getRepository(Responsability).find({
			where: { participantId: juan.id },
			order: { name: 'ASC' },
		});

		expect(assignments).toHaveLength(2);
		expect(assignments.map((a) => a.name).sort()).toEqual(['Palancas', 'Snacks']);
	});

	it('should not overwrite an existing assignment when assigning the same server to another responsibility', async () => {
		const ds = getDS();
		const juan = await createServer('Juan', 'Perez');
		const palancas = await createResponsibility('Palancas');
		const snacks = await createResponsibility('Snacks');

		await responsabilityService.assignResponsabilityToParticipant(palancas.id, juan.id, ds);
		await responsabilityService.assignResponsabilityToParticipant(snacks.id, juan.id, ds);

		const palancasRow = await ds
			.getRepository(Responsability)
			.findOne({ where: { id: palancas.id } });
		const snacksRow = await ds
			.getRepository(Responsability)
			.findOne({ where: { id: snacks.id } });

		expect(palancasRow?.participantId).toBe(juan.id);
		expect(snacksRow?.participantId).toBe(juan.id);
	});

	it('should return the participant in getResponsibilitiesForParticipant for every assigned responsibility', async () => {
		const ds = getDS();
		const juan = await createServer('Juan', 'Perez');
		const r1 = await createResponsibility('Tarea A');
		const r2 = await createResponsibility('Tarea B');
		const r3 = await createResponsibility('Tarea C');

		await responsabilityService.assignResponsabilityToParticipant(r1.id, juan.id, ds);
		await responsabilityService.assignResponsabilityToParticipant(r2.id, juan.id, ds);
		await responsabilityService.assignResponsabilityToParticipant(r3.id, juan.id, ds);

		const list = await responsabilityService.getResponsibilitiesForParticipant(juan.id, ds);
		expect(list).toHaveLength(3);
		expect(list.map((r) => r.name).sort()).toEqual(['Tarea A', 'Tarea B', 'Tarea C']);
	});
});
