import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { retreatRoleService } from '@/services/retreatRoleService';
import { AppDataSource } from '@/data-source';
import { AuditLog, AuditActionType } from '@/entities/auditLog.entity';
import { UserRetreat } from '@/entities/userRetreat.entity';

// approve/reject de invitaciones cambiaban el acceso a un retiro sin dejar
// rastro en audit_logs (invite/remove sí lo hacían). El mismo mecanismo del
// servicio ahora cubre las dos transiciones.
describe('retreatRoleService — auditoría de invitaciones', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// clearTestData no alcanza audit_logs (sin FK hacia retreat): sin esto,
		// la fila del test anterior contamina al siguiente.
		await AppDataSource.query('DELETE FROM audit_logs;');
	});

	const auditRepo = () => AppDataSource.getRepository(AuditLog);

	async function seedPendingInvitation(
		retreatId: string,
		userId: string,
		roleId: number,
		invitedBy: string,
	) {
		const repo = AppDataSource.getRepository(UserRetreat);
		return repo.save(
			repo.create({
				userId,
				retreatId,
				roleId,
				status: 'pending',
				invitedBy,
				invitedAt: new Date(),
			}),
		);
	}

	it('approveRetreatInvitation deja role_invitation_approved con aprobador e invitado', async () => {
		const approver = await TestDataFactory.createTestUser();
		const invitee = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: approver.id });
		const role = await TestDataFactory.createTestRole();
		await seedPendingInvitation(retreat.id, invitee.id, role.id, approver.id);

		await retreatRoleService.approveRetreatInvitation(retreat.id, invitee.id, approver.id);

		const rows = await auditRepo().find({
			where: { actionType: AuditActionType.ROLE_INVITATION_APPROVED },
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBe(approver.id);
		expect(rows[0].targetUserId).toBe(invitee.id);
		expect(rows[0].retreatId).toBe(retreat.id);
		expect(rows[0].newValues).toMatchObject({ status: 'active', role: role.name });
	});

	it('rejectRetreatInvitation deja role_invitation_revoked y devuelve true', async () => {
		const rejector = await TestDataFactory.createTestUser();
		const invitee = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: rejector.id });
		const role = await TestDataFactory.createTestRole();
		await seedPendingInvitation(retreat.id, invitee.id, role.id, rejector.id);

		await expect(
			retreatRoleService.rejectRetreatInvitation(retreat.id, invitee.id, rejector.id),
		).resolves.toBe(true);

		const rows = await auditRepo().find({
			where: { actionType: AuditActionType.ROLE_INVITATION_REVOKED },
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBe(rejector.id);
		expect(rows[0].retreatId).toBe(retreat.id);
	});

	it('reject sin invitación pendiente no deja fila', async () => {
		const rejector = await TestDataFactory.createTestUser();
		const stranger = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: rejector.id });

		await expect(
			retreatRoleService.rejectRetreatInvitation(retreat.id, stranger.id, rejector.id),
		).resolves.toBe(false);

		const rows = await auditRepo().find({
			where: { actionType: AuditActionType.ROLE_INVITATION_REVOKED },
		});
		expect(rows).toHaveLength(0);
	});
});
