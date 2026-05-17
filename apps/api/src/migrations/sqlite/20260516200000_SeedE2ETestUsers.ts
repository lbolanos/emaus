import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

/**
 * Seed users and one community fixture used by E2E auth tests.
 *
 * Idempotent: re-runs do nothing because all inserts use `INSERT OR IGNORE` on
 * the unique email columns and on the unique `(communityId, userId)` constraint.
 *
 * Production guard: refuses to run unless `SEED_E2E_USERS_PRODUCTION=true`.
 *
 * Fixture summary (passwords are intentionally weak — DEV ONLY):
 *   e2e-owner@test.local    (Test1234!)  → owner of "E2E Test Community"
 *   e2e-admin@test.local    (Test1234!)  → admin   of same community
 *   e2e-member@test.local   (Test1234!)  → no admin rights (regular user)
 *   e2e-other@test.local    (Test1234!)  → unrelated owner of another community
 */
export class SeedE2ETestUsers20260516200000 implements MigrationInterface {
	name = 'SeedE2ETestUsers';
	timestamp = '20260516200000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		if (process.env.NODE_ENV === 'production' && process.env.SEED_E2E_USERS_PRODUCTION !== 'true') {
			console.log('⏭  Skipping E2E user seed in production (set SEED_E2E_USERS_PRODUCTION=true to force)');
			return;
		}

		const password = 'Test1234!';
		const hash = await bcrypt.hash(password, 10);

		const users = [
			{ id: uuidv4(), email: 'e2e-owner@test.local', name: 'E2E Owner' },
			{ id: uuidv4(), email: 'e2e-admin@test.local', name: 'E2E Admin' },
			{ id: uuidv4(), email: 'e2e-member@test.local', name: 'E2E Member' },
			{ id: uuidv4(), email: 'e2e-other@test.local', name: 'E2E Other Owner' },
		];

		for (const u of users) {
			await queryRunner.query(
				`INSERT OR IGNORE INTO users (id, email, displayName, password, createdAt, updatedAt)
				 VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
				[u.id, u.email, u.name, hash],
			);
		}

		// Re-fetch real IDs (in case rows already existed)
		const userRows = await queryRunner.query(
			`SELECT id, email FROM users WHERE email IN (?, ?, ?, ?)`,
			users.map((u) => u.email),
		);
		const byEmail = Object.fromEntries(userRows.map((r: any) => [r.email, r.id]));
		const ownerId = byEmail['e2e-owner@test.local'];
		const adminId = byEmail['e2e-admin@test.local'];
		const otherId = byEmail['e2e-other@test.local'];

		// Communities — fixed UUIDs so tests can target them directly.
		const communityId = 'e2e00001-aaaa-aaaa-aaaa-000000000001';
		const otherCommunityId = 'e2e00002-bbbb-bbbb-bbbb-000000000002';

		await queryRunner.query(
			`INSERT OR IGNORE INTO community (
				id, name, description, address1, city, state, zipCode, country,
				status, contactEmail, createdBy, createdAt, updatedAt
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, datetime('now'), datetime('now'))`,
			[
				communityId,
				'E2E Test Community',
				'Community used by E2E auth tests — DO NOT DELETE.',
				'Calle E2E 1',
				'Ciudad de México',
				'CDMX',
				'01000',
				'México',
				'e2e-owner@test.local',
				ownerId,
			],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community (
				id, name, description, address1, city, state, zipCode, country,
				status, contactEmail, createdBy, createdAt, updatedAt
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, datetime('now'), datetime('now'))`,
			[
				otherCommunityId,
				'E2E Other Community',
				'Second community for cross-tenant tests.',
				'Calle Otra 99',
				'Guadalajara',
				'JAL',
				'44100',
				'México',
				'e2e-other@test.local',
				otherId,
			],
		);

		// Admin links — owner + admin on primary, other on secondary
		const adminLinks = [
			{ communityId, userId: ownerId, role: 'owner' },
			{ communityId, userId: adminId, role: 'admin' },
			{ communityId: otherCommunityId, userId: otherId, role: 'owner' },
		];
		for (const link of adminLinks) {
			const existing = await queryRunner.query(
				`SELECT id FROM community_admin WHERE communityId = ? AND userId = ?`,
				[link.communityId, link.userId],
			);
			if (existing.length > 0) continue;
			await queryRunner.query(
				`INSERT INTO community_admin (id, communityId, userId, role, status, invitedAt, acceptedAt)
				 VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`,
				[uuidv4(), link.communityId, link.userId, link.role],
			);
		}

		// Test participant + community_member for trimming tests.
		// Idempotent: skip if a participant with this id already exists.
		const memberParticipantId = 'e2e00003-cccc-cccc-cccc-000000000003';
		const memberRowId = 'e2e00004-dddd-dddd-dddd-000000000004';
		const existingParticipant = await queryRunner.query(
			`SELECT id FROM participants WHERE id = ?`,
			[memberParticipantId],
		);
		if (existingParticipant.length === 0) {
			await queryRunner.query(
				`INSERT INTO participants (
					id, firstName, lastName, birthDate, maritalStatus, street, houseNumber,
					postalCode, neighborhood, city, state, country, cellPhone, email,
					occupation, sacraments, emergencyContact1Name, emergencyContact1Relation, emergencyContact1CellPhone
				) VALUES (?, 'E2E', 'TestMember', '1990-01-01', 'S', 'Calle E2E', '1', '01000', 'Centro', 'CDMX', 'CDMX', 'México', '5550000001', 'e2e-participant@test.local', 'Tester', 'baptism,communion', 'EC1', 'spouse', '5550000999')`,
				[memberParticipantId],
			);
		}
		const existingMember = await queryRunner.query(
			`SELECT id FROM community_member WHERE id = ?`,
			[memberRowId],
		);
		if (existingMember.length === 0) {
			await queryRunner.query(
				`INSERT INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt)
				 VALUES (?, ?, ?, 'active_member', datetime('now'), datetime('now'))`,
				[memberRowId, communityId, memberParticipantId],
			);
		}

		console.log('🌱 E2E test users + communities + member seeded');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Best-effort cleanup. Skip in production by default.
		if (process.env.NODE_ENV === 'production' && process.env.SEED_E2E_USERS_PRODUCTION !== 'true') {
			return;
		}
		const emails = [
			'e2e-owner@test.local',
			'e2e-admin@test.local',
			'e2e-member@test.local',
			'e2e-other@test.local',
		];
		await queryRunner.query(
			`DELETE FROM community_member WHERE id = ?`,
			['e2e00004-dddd-dddd-dddd-000000000004'],
		);
		await queryRunner.query(`DELETE FROM participants WHERE id = ?`, [
			'e2e00003-cccc-cccc-cccc-000000000003',
		]);
		await queryRunner.query(
			`DELETE FROM community_admin WHERE userId IN (SELECT id FROM users WHERE email IN (?, ?, ?, ?))`,
			emails,
		);
		await queryRunner.query(`DELETE FROM community WHERE id IN (?, ?)`, [
			'e2e00001-aaaa-aaaa-aaaa-000000000001',
			'e2e00002-bbbb-bbbb-bbbb-000000000002',
		]);
		await queryRunner.query(
			`DELETE FROM users WHERE email IN (?, ?, ?, ?)`,
			emails,
		);
	}
}
