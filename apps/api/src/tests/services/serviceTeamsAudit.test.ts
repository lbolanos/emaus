import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import {
	createTeam,
	updateTeam,
	deleteTeam,
	addMember,
	removeMember,
	assignLeader,
	unassignLeader,
} from '@/services/serviceTeamService';
import { auditContext } from '@/utils/auditContext';

// Tanda P2, bloque B: los equipos de servicio (logística, cocina, música…)
// mutaban sin rastro — quién entró, quién lidera, quién se fue. El CRUD y las
// operaciones de miembro/líder ahora dejan fila; createDefaultServiceTeams
// (semilla del retiro) no se audita.
describe('equipos de servicio — auditoría de dominio', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const auditRepo = () => AppDataSource.getRepository(DomainAuditLog);

	async function waitForLogs(
		predicate: (rows: DomainAuditLog[]) => boolean,
		tries = 60,
		delayMs = 5,
	): Promise<DomainAuditLog[]> {
		let rows = await auditRepo().find();
		for (let i = 0; i < tries && !predicate(rows); i++) {
			await new Promise((r) => setTimeout(r, delayMs));
			rows = await auditRepo().find();
		}
		return rows;
	}

	const rowsOf = (rows: DomainAuditLog[], action: string) =>
		rows.filter((r) => r.action === action);
	const meta = (row: DomainAuditLog) => JSON.parse(row.metadata ?? '{}');

	it('create/update/delete de equipo con diff y conteo de miembros', async () => {
		const actor = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: actor.id });
		const member = await TestDataFactory.createTestParticipant(retreat.id);

		await auditContext.run({ userId: actor.id, ip: '10.0.0.51' }, async () => {
			const team = (await createTeam({
				name: 'Cocina',
				teamType: 'cocina',
				retreatId: retreat.id,
				description: 'Equipo de comidas',
			}))!;
			await addMember(team.id, member.id);
			await updateTeam(team.id, { name: 'Comedor y cocina' });
			await deleteTeam(team.id);
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'service_team.delete').length > 0);
		const create = rowsOf(rows, 'service_team.create')[0];
		expect(create.resourceType).toBe('service_team');
		expect(create.retreatId).toBe(retreat.id);
		expect(create.actorUserId).toBe(actor.id);
		expect(create.ipAddress).toBe('10.0.0.51');
		expect(JSON.parse(create.newValues!)).toMatchObject({
			name: 'Cocina',
			teamType: 'cocina',
		});
		// description queda fuera del diff: solo su tamaño.
		expect(JSON.parse(create.newValues!)).not.toHaveProperty('description');
		expect(meta(create).descriptionChars).toBe('Equipo de comidas'.length);

		const update = rowsOf(rows, 'service_team.update')[0];
		expect(JSON.parse(update.oldValues!)).toMatchObject({ name: 'Cocina' });
		expect(JSON.parse(update.newValues!)).toMatchObject({ name: 'Comedor y cocina' });

		const del = rowsOf(rows, 'service_team.delete')[0];
		// El conteo se toma ANTES del delete: el cascade ya se llevó al miembro.
		expect(meta(del).cascadeMembers).toBe(1);
	});

	it('addMember/assignLeader/unassignLeader/removeMember dejan su acción', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const participant = await TestDataFactory.createTestParticipant(retreat.id);
		const other = await TestDataFactory.createTestParticipant(retreat.id);

		const teamA = (await createTeam({
			name: 'Música',
			teamType: 'musica',
			retreatId: retreat.id,
		}))!;
		const teamB = (await createTeam({
			name: 'Logística',
			teamType: 'logistica',
			retreatId: retreat.id,
		}))!;

		await addMember(teamA.id, participant.id, 'ayudante');
		await assignLeader(teamB.id, participant.id, teamA.id);
		await unassignLeader(teamB.id);
		await removeMember(teamB.id, participant.id);

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'service_team.remove_member').length > 0,
		);

		const add = rowsOf(rows, 'service_team.add_member')[0];
		expect(add.retreatId).toBe(retreat.id);
		expect(JSON.parse(add.newValues!)).toMatchObject({
			participantId: participant.id,
			role: 'ayudante',
		});
		expect(meta(add)).toEqual({});

		const assign = rowsOf(rows, 'service_team.assign_leader')[0];
		expect(assign.resourceId).toBe(teamB.id);
		expect(JSON.parse(assign.oldValues!)).toMatchObject({ leaderId: null });
		expect(JSON.parse(assign.newValues!)).toMatchObject({ leaderId: participant.id });
		expect(meta(assign)).toMatchObject({ movedFromTeamId: teamA.id, addedAsMember: true });

		const unassign = rowsOf(rows, 'service_team.unassign_leader')[0];
		expect(JSON.parse(unassign.oldValues!)).toMatchObject({ leaderId: participant.id });
		expect(JSON.parse(unassign.newValues!)).toMatchObject({ leaderId: null });

		const remove = rowsOf(rows, 'service_team.remove_member')[0];
		expect(remove.resourceId).toBe(teamB.id);
		expect(JSON.parse(remove.oldValues!)).toMatchObject({ participantId: participant.id });

		// other nunca entró a un equipo: ninguna fila lo menciona.
		const mentionsOther = rows.some((r) =>
			[r.oldValues, r.newValues, r.metadata].some(
				(blob) => blob?.includes(other.id),
			),
		);
		expect(mentionsOther).toBe(false);
	});
});
