import { test, expect } from '@playwright/test';
import {
	E2E_COMMUNITIES,
	E2E_HOUSE_ID,
	E2E_USERS,
	loginAs,
	withCsrf,
} from './helpers/auth';

/**
 * E2E de las estadísticas de asistencia por tipo de reunión y de su proyección
 * sobre el equipo servidor de un retiro.
 *
 * Lo que sólo se puede comprobar end-to-end (HTTP + DB real):
 *  - El filtro por `meetingType` recorta de verdad el conjunto.
 *  - Una reunión FUTURA sin asistencia queda fuera del denominador — la
 *    regresión que hundía todos los porcentajes.
 *  - `GET /server-attendance/:retreatId` exige que el retiro esté vinculado a
 *    ESA comunidad, y un servidor fuera del padrón no aparece (nunca 0%).
 *  - Vincular un retiro a una comunidad que no administras da 403.
 *
 * Pre-req: migrations `20260516200000_SeedE2ETestUsers` (owner + comunidades) y
 * `20260721130000` (superadmin + casa E2E). En una base con datos de prod no
 * existen y los tests se saltan con motivo.
 */
test.use({ locale: 'es-MX' });

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

test.describe.serial('Estadísticas de asistencia por tipo de reunión — E2E', () => {
	const community = E2E_COMMUNITIES.primary;

	test('filtra por tipo y deja las reuniones futuras fuera del denominador', async ({
		baseURL,
	}) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const stamp = Date.now();

		const makeMeeting = async (title: string, meetingType: string, offsetDays: number) => {
			const res = await s.ctx.post(`/api/communities/${community}/meetings`, {
				data: { title, startDate: iso(offsetDays), durationMinutes: 60, meetingType },
				headers: withCsrf(s.csrfToken),
			});
			expect(res.status(), `crear ${title}`).toBe(201);
			const body = await res.json();
			// El tipo tiene que persistir: si el schema lo tirara, el filtro de
			// abajo pasaría por accidente al no haber nada que filtrar.
			expect(body.meetingType).toBe(meetingType);
			return body.id as string;
		};

		const pastPrep = await makeMeeting(`E2E Prep pasada ${stamp}`, 'preparation', -10);
		const futurePrep = await makeMeeting(`E2E Prep futura ${stamp}`, 'preparation', 10);
		const general = await makeMeeting(`E2E General ${stamp}`, 'general', -5);

		// Miembro con ingreso muy anterior: cualquier reunión le cuenta.
		const createMember = await s.ctx.post(`/api/communities/${community}/members/create`, {
			data: {
				firstName: 'E2E',
				lastName: `Stats ${stamp}`,
				email: `e2e-stats-${stamp}@test.local`,
				cellPhone: `55${String(stamp).slice(-8)}`,
				joinedAt: '2020-01-01',
			},
			headers: withCsrf(s.csrfToken),
		});
		expect(createMember.status()).toBe(201);
		const memberId = (await createMember.json()).id as string;

		// Presente en la preparación pasada, ausente en la general.
		const bulk = await s.ctx.post(
			`/api/communities/${community}/members/${memberId}/attendance/bulk`,
			{
				data: {
					records: [
						{ meetingId: pastPrep, attended: true },
						{ meetingId: general, attended: false },
					],
				},
				headers: withCsrf(s.csrfToken),
			},
		);
		expect(bulk.ok(), `bulk attendance: ${bulk.status()}`).toBeTruthy();

		// --- Filtro por tipo = preparation ---
		const prepRes = await s.ctx.get(
			`/api/communities/${community}/attendance-stats?meetingType=preparation`,
		);
		expect(prepRes.ok(), `stats preparation: ${prepRes.status()}`).toBeTruthy();
		const prep = await prepRes.json();

		const prepIds = prep.meetings.map((m: { id: string }) => m.id);
		expect(prepIds).toContain(pastPrep);
		// La futura no cuenta: nadie ha podido asistir todavía.
		expect(prepIds).not.toContain(futurePrep);
		// Y la general tampoco, que es lo que prueba el filtro.
		expect(prepIds).not.toContain(general);

		const prepRow = prep.members.find((m: { memberId: string }) => m.memberId === memberId);
		expect(prepRow, 'el miembro debe estar en el ranking').toBeTruthy();
		expect(prepRow.attended).toBe(1);
		expect(prepRow.total).toBe(1); // 1, no 2: la futura está fuera del denominador
		expect(Math.round(prepRow.ratePercent)).toBe(100);
		expect(prepRow.frequency).toBe('high');

		// --- Filtro por tipo = general ---
		const generalRes = await s.ctx.get(
			`/api/communities/${community}/attendance-stats?meetingType=general`,
		);
		const generalStats = await generalRes.json();
		const generalRow = generalStats.members.find(
			(m: { memberId: string }) => m.memberId === memberId,
		);
		expect(generalStats.meetings.map((m: { id: string }) => m.id)).toContain(general);
		expect(generalRow.attended).toBe(0);
		expect(generalRow.total).toBeGreaterThanOrEqual(1);

		// El tipo aparece en el catálogo de tipos disponibles, con las 2 (pasada +
		// futura): el filtro ofrece el tipo aunque su única reunión sea futura.
		const prepType = prep.availableTypes.find(
			(t: { meetingType: string }) => t.meetingType === 'preparation',
		);
		expect(prepType.count).toBeGreaterThanOrEqual(2);

		// --- Un filtro vacío no es un 400 ---
		const emptyFilters = await s.ctx.get(
			`/api/communities/${community}/attendance-stats?meetingType=&from=&to=`,
		);
		expect(emptyFilters.status(), 'el cliente manda "" al limpiar un filtro').toBe(200);

		// --- Un tipo inventado sí lo es ---
		const badType = await s.ctx.get(
			`/api/communities/${community}/attendance-stats?meetingType=inventado`,
		);
		expect(badType.status()).toBe(400);

		// Limpieza de las reuniones creadas (el miembro se queda: `members/create`
		// no tiene contraparte de borrado en este flujo y no estorba).
		for (const id of [pastPrep, futurePrep, general]) {
			await s.ctx.delete(`/api/communities/meetings/${id}`, {
				headers: withCsrf(s.csrfToken),
			});
		}
		await s.dispose();
	});

	test('la proyección al equipo servidor exige el vínculo con esa comunidad', async ({
		baseURL,
	}) => {
		// El retiro lo crea el superadmin (necesita `retreat:create` + la casa E2E);
		// las lecturas de asistencia van con el owner de la comunidad.
		const admin = await loginAs(baseURL!, E2E_USERS.superadmin).catch(() => null);
		test.skip(!admin, 'e2e-superadmin no sembrado en esta base (¿DB con datos de prod?)');
		const stamp = Date.now();

		const createRetreat = await admin!.ctx.post('/api/retreats', {
			headers: withCsrf(admin!.csrfToken),
			data: {
				parish: `E2E Asistencia ${stamp}`,
				startDate: '2030-03-08',
				endDate: '2030-03-10',
				houseId: E2E_HOUSE_ID,
			},
		});
		expect(createRetreat.ok(), `create retreat: ${createRetreat.status()}`).toBeTruthy();
		const retreatId = (await createRetreat.json()).id as string;

		const owner = await loginAs(baseURL!, E2E_USERS.owner);
		// Borrar el retiro NO borra las reuniones que la sincronización creó en la
		// comunidad: viven en `community_meeting` y sobrevivirían a la corrida,
		// dejando el spec no re-ejecutable.
		const createdMeetingIds: string[] = [];
		try {
			// 1. Sin vincular → 400 con motivo, no un 500 ni una lista vacía silenciosa.
			const unlinked = await owner.ctx.get(
				`/api/communities/${community}/server-attendance/${retreatId}`,
			);
			expect(unlinked.status()).toBe(400);
			expect((await unlinked.json()).message).toContain('no está vinculado');

			// 2. Vincular. El superadmin puede sin fila en community_admin.
			const link = await admin!.ctx.put(`/api/retreats/${retreatId}`, {
				headers: withCsrf(admin!.csrfToken),
				data: { communityId: community },
			});
			expect(link.ok(), `link retreat: ${link.status()}`).toBeTruthy();
			expect((await link.json()).communityId).toBe(community);

			// 3. Ya vinculado → 200. El retiro está recién creado y sin servidores,
			// así que lo que se afirma es la forma del contrato, no un porcentaje.
			// Sin parámetros de filtro: mide las preparaciones DEL RETIRO, y el
			// conjunto lo delimita su calendario.
			const linked = await owner.ctx.get(
				`/api/communities/${community}/server-attendance/${retreatId}`,
			);
			expect(linked.ok(), `server-attendance: ${linked.status()}`).toBeTruthy();
			const body = await linked.json();
			expect(body.communityId).toBe(community);
			expect(body.retreatId).toBe(retreatId);
			expect(Array.isArray(body.entries)).toBe(true);
			// Sin servidores en el retiro no hay ni match ni unmatch.
			expect(body.serverCount).toBe(0);
			expect(body.matchedCount).toBe(0);
			expect(body.unmatchedCount).toBe(0);
			// Recién creado y sin sincronizar: 0 preparaciones vinculadas, que es lo
			// que deja a la UI decir "sincronízalas" en vez de no pintar badge.
			expect(body.retreatLinkedMeetingCount).toBe(0);

			// 4. Cross-tenant: pedir la asistencia desde OTRA comunidad. El owner no
			// administra `other`, así que el guard de comunidad corta antes (403); si
			// alguna vez lo administrara, el servicio cortaría con 400 por el vínculo.
			const crossTenant = await owner.ctx.get(
				`/api/communities/${E2E_COMMUNITIES.other}/server-attendance/${retreatId}`,
			);
			expect([400, 403]).toContain(crossTenant.status());

			// 5. Vincular sin administrar la comunidad → 403.
			const outsider = await loginAs(baseURL!, E2E_USERS.other);
			const forbidden = await outsider.ctx.put(`/api/retreats/${retreatId}`, {
				headers: withCsrf(outsider.csrfToken),
				data: { communityId: E2E_COMMUNITIES.other },
			});
			expect([403, 404]).toContain(forbidden.status());
			await outsider.dispose();

			// 6. El reporte acota el ranking al equipo servidor del retiro.
			const scoped = await owner.ctx.get(
				`/api/communities/${community}/attendance-stats?retreatId=${retreatId}`,
			);
			expect(scoped.ok(), `attendance-stats con retreatId: ${scoped.status()}`).toBeTruthy();
			const scopedBody = await scoped.json();
			// Retiro recién creado y sin servidores: el ranking queda vacío, pero las
			// reuniones siguen siendo las de la comunidad.
			expect(scopedBody.members).toHaveLength(0);
			expect(scopedBody.retreats.map((r: { id: string }) => r.id)).toContain(retreatId);

			// 7. La convocatoria ya NO es un endpoint de correo masivo: es una
			//    secuencia de WhatsApp. Se comprueba que la ruta vieja no exista, para
			//    que nadie la reintroduzca sin darse cuenta.
			const oldConvokeRoute = await owner.ctx.post(
				`/api/communities/${community}/retreats/${retreatId}/convoke`,
				{ data: { dryRun: true }, headers: withCsrf(owner.csrfToken) },
			);
			expect(oldConvokeRoute.status()).toBe(404);

			// 7b. La secuencia de convocatoria: se importa INACTIVA y su audiencia es
			//     el padrón de la comunidad. No se activa aquí — activarla enrolaría
			//     de verdad y este spec no es el sitio para materializar mensajes.
			const globals = await admin!.ctx.get('/api/global-message-sequences');
			expect(globals.ok(), `global sequences: ${globals.status()}`).toBeTruthy();
			const convocation = ((await globals.json()) as { id: string; audience: string }[]).find(
				(seq) => seq.audience === 'community_roster',
			);
			expect(convocation, 'la secuencia de convocatoria debe estar sembrada').toBeTruthy();

			const imported = await admin!.ctx.post(
				`/api/global-message-sequences/${convocation!.id}/copy-to-retreat`,
				{ data: { retreatId }, headers: withCsrf(admin!.csrfToken) },
			);
			expect(imported.ok(), `copy-to-retreat: ${imported.status()}`).toBeTruthy();
			const importedSeq = await imported.json();
			expect(importedSeq.audience).toBe('community_roster');
			// Llega apagada: el coordinador la revisa antes de que enrole a nadie.
			expect(importedSeq.isActive).toBe(false);
			// Y por WhatsApp, que en este sistema se encola y despacha a mano.
			expect(importedSeq.steps[0].channel).toBe('whatsapp');
			expect(importedSeq.steps[0].templateType).toBe('SERVER_CONVOCATION');

			// 8. Sincronizar el calendario de preparaciones como reuniones de comunidad.
			// Fecha única por corrida: la sincronización ADOPTA la reunión que ya
			// exista ese día, así que una fecha fija haría que la segunda ejecución
			// adoptara los restos de la primera y `created` bajara a 0.
			const firstDate = `2030-${String((stamp % 12) + 1).padStart(2, '0')}-06`;
			const generate = await admin!.ctx.post(
				`/api/retreat-preparations/retreats/${retreatId}/generate`,
				{
					data: { weeks: 2, firstDate, time: '20:00', clearExisting: true },
					headers: withCsrf(admin!.csrfToken),
				},
			);
			expect(generate.ok(), `generate preparations: ${generate.status()}`).toBeTruthy();

			const sync = await admin!.ctx.post(
				`/api/retreat-preparations/retreats/${retreatId}/sync-community-meetings`,
				{ headers: withCsrf(admin!.csrfToken) },
			);
			expect(sync.ok(), `sync preparations: ${sync.status()}`).toBeTruthy();
			const syncBody = await sync.json();
			expect(syncBody.created).toBe(2);
			createdMeetingIds.push(...(syncBody.meetingIds as string[]));

			// Idempotente: la segunda pasada no duplica la serie.
			const resync = await admin!.ctx.post(
				`/api/retreat-preparations/retreats/${retreatId}/sync-community-meetings`,
				{ headers: withCsrf(admin!.csrfToken) },
			);
			const resyncBody = await resync.json();
			expect(resyncBody.created).toBe(0);
			expect(resyncBody.adopted).toBe(0);

			// Y el calendario devuelve la asistencia: las dos son futuras (2030), así
			// que van marcadas como pendientes y NO como 0%.
			const calendar = await admin!.ctx.get(
				`/api/retreat-preparations/retreats/${retreatId}`,
			);
			const sessions = (await calendar.json()).filter(
				(row: { type: string }) => row.type === 'session',
			);
			expect(sessions).toHaveLength(2);
			for (const session of sessions) {
				expect(session.communityMeetingId).toBeTruthy();
				expect(session.attendance.pending).toBe(true);
			}

			// 6. Desvincular no exige permisos de comunidad y deja el retiro usable.
			const unlink = await admin!.ctx.put(`/api/retreats/${retreatId}`, {
				headers: withCsrf(admin!.csrfToken),
				data: { communityId: null },
			});
			expect(unlink.ok()).toBeTruthy();
			expect((await unlink.json()).communityId).toBeNull();
		} finally {
			for (const meetingId of createdMeetingIds) {
				await owner.ctx
					.delete(`/api/communities/meetings/${meetingId}`, {
						headers: withCsrf(owner.csrfToken),
					})
					.catch(() => undefined);
			}
			await admin!.ctx.delete(`/api/retreats/${retreatId}`, {
				headers: withCsrf(admin!.csrfToken),
			});
			await owner.dispose();
			await admin!.dispose();
		}
	});
});
