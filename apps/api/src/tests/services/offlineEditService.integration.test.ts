/**
 * Field edits made without signal (specs/offline-mode, D13/FR-16b) against the
 * real test database: the server compares the value each field had on the phone
 * with the stored one, and a change made meanwhile by somebody else wins.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Participant } from '@/entities/participant.entity';
import { checkExpectedValues } from '@/services/offlineEditService';
import { updateParticipant } from '@/services/participantService';

const getDS = () => TestDataFactory.getDataSource();

describe('checkExpectedValues (integration)', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	async function walker(overrides: Partial<Participant> = {}) {
		const retreat = await TestDataFactory.createTestRetreat();
		return TestDataFactory.createTestParticipant(retreat.id, {
			cellPhone: '5512345678',
			parish: 'San Juan',
			...overrides,
		});
	}

	test('the phone saw what the server has → ok', async () => {
		const p = await walker();
		expect(await checkExpectedValues(p.id, { cellPhone: '5512345678', parish: 'San Juan' })).toEqual({ kind: 'ok' });
	});

	test('empty, null and missing are the same; text compares trimmed', async () => {
		const p = await walker({ nickname: null as any });
		expect(await checkExpectedValues(p.id, { nickname: '', parish: ' San Juan ' })).toEqual({ kind: 'ok' });
	});

	test('snores: false on the server and a phone that had nothing are the same "no"', async () => {
		const p = await walker({ snores: false });
		expect(await checkExpectedValues(p.id, { snores: null })).toEqual({ kind: 'ok' });
		expect(await checkExpectedValues(p.id, { snores: false })).toEqual({ kind: 'ok' });
		await getDS().getRepository(Participant).update({ id: p.id }, { snores: true });
		expect((await checkExpectedValues(p.id, { snores: false })).kind).toBe('changed');
	});

	test('somebody changed the phone meanwhile → changed, with a message the team can act on', async () => {
		const p = await walker();
		await updateParticipant(p.id, { cellPhone: '5599998888' } as any);

		const check = await checkExpectedValues(p.id, { cellPhone: '5512345678', parish: 'San Juan' });

		expect(check).toMatchObject({ kind: 'changed', fields: ['cellPhone'] });
		expect((check as any).message).toContain('celular');
	});

	test('a field outside the list is refused, never compared', async () => {
		const p = await walker();
		expect(await checkExpectedValues(p.id, { email: 'x@example.com', cellPhone: '5512345678' })).toEqual({
			kind: 'invalid',
			fields: ['email'],
		});
		expect(await checkExpectedValues(p.id, { medicationDetails: '' })).toEqual({
			kind: 'invalid',
			fields: ['medicationDetails'],
		});
		expect((await checkExpectedValues(p.id, ['cellPhone'])).kind).toBe('invalid');
	});

	test('unknown participant → not-found', async () => {
		expect(await checkExpectedValues('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { parish: 'x' })).toEqual({
			kind: 'not-found',
		});
	});
});
