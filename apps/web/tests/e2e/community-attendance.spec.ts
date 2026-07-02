import { test, expect } from '@playwright/test';
import { E2E_COMMUNITIES, E2E_USERS, loginAs, withCsrf } from './helpers/auth';

/**
 * E2E del flujo de asistencia por miembro + fecha de ingreso (joinedAt).
 *
 * Cubre end-to-end (HTTP + DB) las features de julio 2026:
 *  - Crear miembro con `joinedAt` custom.
 *  - GET /members/:memberId/attendance (asistencia del miembro).
 *  - POST /members/:memberId/attendance/bulk (upsert de varias reuniones).
 *  - getMembers expone el conteo lastMeetingsAttended / lastMeetingsTotal.
 *  - Editar joinedAt vía PATCH /profile.
 *
 * Pre-req: migration `20260516200000_SeedE2ETestUsers` (owner + comunidad primary).
 */
test.use({ locale: 'es-MX' });

test.describe.serial('Community Attendance por miembro — E2E', () => {
	const community = E2E_COMMUNITIES.primary;

	test('crear miembro con joinedAt, registrar asistencia bulk y ver el conteo', async ({
		baseURL,
	}) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const stamp = Date.now();
		const joinedAt = '2020-01-01'; // muy anterior → cualquier reunión cuenta

		// 1. Crear miembro con fecha de ingreso custom
		const createRes = await s.ctx.post(`/api/communities/${community}/members/create`, {
			data: {
				firstName: 'E2E',
				lastName: `Asistencia ${stamp}`,
				email: `e2e-attendance-${stamp}@test.local`,
				cellPhone: `55${String(stamp).slice(-8)}`,
				joinedAt,
			},
			headers: withCsrf(s.csrfToken),
		});
		expect(createRes.status()).toBe(201);
		const member = await createRes.json();
		const memberId = member.id;
		expect(memberId).toBeTruthy();
		// joinedAt custom persistido (roundtrip UTC).
		expect(new Date(member.joinedAt).toISOString().slice(0, 10)).toBe(joinedAt);

		// 2. Crear dos reuniones (pasadas)
		const makeMeeting = async (title: string, daysAgo: number) => {
			const startDate = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
			const r = await s.ctx.post(`/api/communities/${community}/meetings`, {
				data: { title, startDate, durationMinutes: 60 },
				headers: withCsrf(s.csrfToken),
			});
			expect(r.status()).toBe(201);
			return (await r.json()).id as string;
		};
		const m1 = await makeMeeting(`E2E R1 ${stamp}`, 10);
		const m2 = await makeMeeting(`E2E R2 ${stamp}`, 5);

		// 3. Asistencia del miembro inicialmente vacía
		let attRes = await s.ctx.get(`/api/communities/${community}/members/${memberId}/attendance`);
		expect(attRes.ok()).toBe(true);
		expect(await attRes.json()).toEqual([]);

		// 4. Bulk: presente en m1, ausente en m2 (una sola llamada)
		const bulkRes = await s.ctx.post(
			`/api/communities/${community}/members/${memberId}/attendance/bulk`,
			{
				data: {
					records: [
						{ meetingId: m1, attended: true },
						{ meetingId: m2, attended: false },
					],
				},
				headers: withCsrf(s.csrfToken),
			},
		);
		expect(bulkRes.status()).toBe(201);
		expect((await bulkRes.json()).updated).toBe(2);

		// 5. La asistencia refleja lo guardado
		attRes = await s.ctx.get(`/api/communities/${community}/members/${memberId}/attendance`);
		const records = (await attRes.json()) as { meetingId: string; attended: boolean }[];
		expect(records.find((r) => r.meetingId === m1)?.attended).toBe(true);
		expect(records.find((r) => r.meetingId === m2)?.attended).toBe(false);

		// 6. getMembers expone el conteo (asistidas / total)
		const membersRes = await s.ctx.get(`/api/communities/${community}/members`);
		const members = (await membersRes.json()) as any[];
		const me = members.find((m) => m.id === memberId);
		expect(me).toBeTruthy();
		expect(me.lastMeetingsAttended).toBeGreaterThanOrEqual(1);
		expect(me.lastMeetingsTotal).toBeGreaterThanOrEqual(2);
		expect(typeof me.lastMeetingsAttendanceRate).toBe('number');

		await s.dispose();
	});

	test('editar la fecha de ingreso (joinedAt) vía PATCH /profile', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const stamp = Date.now();

		const createRes = await s.ctx.post(`/api/communities/${community}/members/create`, {
			data: {
				firstName: 'E2E',
				lastName: `Ingreso ${stamp}`,
				email: `e2e-joined-${stamp}@test.local`,
				cellPhone: `56${String(stamp).slice(-8)}`,
			},
			headers: withCsrf(s.csrfToken),
		});
		expect(createRes.status()).toBe(201);
		const memberId = (await createRes.json()).id;

		const newJoined = '2021-06-15';
		const patchRes = await s.ctx.patch(
			`/api/communities/${community}/members/${memberId}/profile`,
			{ data: { joinedAt: newJoined }, headers: withCsrf(s.csrfToken) },
		);
		expect(patchRes.status()).toBe(200);

		// Verificar el cambio vía getMembers
		const membersRes = await s.ctx.get(`/api/communities/${community}/members`);
		const me = ((await membersRes.json()) as any[]).find((m) => m.id === memberId);
		expect(new Date(me.joinedAt).toISOString().slice(0, 10)).toBe(newJoined);

		await s.dispose();
	});

	test('SECURITY: bulk attendance rechaza reunión de otra comunidad', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const stamp = Date.now();
		const createRes = await s.ctx.post(`/api/communities/${community}/members/create`, {
			data: {
				firstName: 'E2E',
				lastName: `Foreign ${stamp}`,
				email: `e2e-foreign-${stamp}@test.local`,
				cellPhone: `57${String(stamp).slice(-8)}`,
			},
			headers: withCsrf(s.csrfToken),
		});
		const memberId = (await createRes.json()).id;

		// meetingId inexistente / de otra comunidad → se ignora, updated=0
		const bulkRes = await s.ctx.post(
			`/api/communities/${community}/members/${memberId}/attendance/bulk`,
			{
				data: { records: [{ meetingId: '00000000-0000-0000-0000-000000000000', attended: true }] },
				headers: withCsrf(s.csrfToken),
			},
		);
		expect(bulkRes.status()).toBe(201);
		expect((await bulkRes.json()).updated).toBe(0);

		await s.dispose();
	});
});
