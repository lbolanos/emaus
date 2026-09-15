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

		test('lista a los que asisten a la comunidad pero no se inscribieron al retiro', async ({
			baseURL,
		}) => {
			const admin = await loginAs(baseURL!, E2E_USERS.superadmin).catch(() => null);
			test.skip(!admin, 'e2e-superadmin no sembrado en esta base (¿DB con datos de prod?)');
			const stamp = Date.now();

			// Retiro propio de la corrida, vinculado a la comunidad y SIN
			// preparaciones sincronizadas: la asistencia de los candidatos se
			// mide contra las reuniones de la COMUNIDAD, no contra las del
			// retiro, así que el caso angustioso (retiro próximo sin calendario)
			// es justo el que este test ejercita.
			const createRetreat = await admin!.ctx.post('/api/retreats', {
				headers: withCsrf(admin!.csrfToken),
				data: {
					parish: `E2E Candidatos ${stamp}`,
					startDate: '2030-04-10',
					endDate: '2030-04-12',
					houseId: E2E_HOUSE_ID,
				},
			});
			expect(createRetreat.ok(), `create retreat: ${createRetreat.status()}`).toBeTruthy();
			const retreatId = (await createRetreat.json()).id as string;

			const link = await admin!.ctx.put(`/api/retreats/${retreatId}`, {
				headers: withCsrf(admin!.csrfToken),
				data: { communityId: community },
			});
			expect(link.ok(), `link retreat: ${link.status()}`).toBeTruthy();

			const owner = await loginAs(baseURL!, E2E_USERS.owner);
			const createdMeetingIds: string[] = [];
			let historyEntryId: string | null = null;
			try {
				// Dos generales pasadas: dos reuniones dan tasas distintas y
				// permiten afirmar el orden por tasa descendente.
				const makeGeneral = async (offsetDays: number) => {
					const res = await owner.ctx.post(`/api/communities/${community}/meetings`, {
						data: {
							title: `E2E General candidata ${stamp} ${offsetDays}`,
							startDate: iso(offsetDays),
							durationMinutes: 60,
							meetingType: 'general',
						},
						headers: withCsrf(owner.csrfToken),
					});
					expect(res.status(), `crear general ${offsetDays}`).toBe(201);
					const body = await res.json();
					createdMeetingIds.push(body.id);
					return body.id as string;
				};
				const generalA = await makeGeneral(-10);
				const generalB = await makeGeneral(-5);

				// Dos miembros del padrón con ingreso antiguo: cualquier reunión
				// les cuenta.
				const makeMember = async (n: number) => {
					const res = await owner.ctx.post(
						`/api/communities/${community}/members/create`,
						{
							data: {
								firstName: 'E2E',
								lastName: `Candidato ${n} ${stamp}`,
								email: `e2e-cand-${stamp}-${n}@test.local`,
								cellPhone: `55${String(stamp).slice(-7)}${n}`,
								joinedAt: '2020-01-01',
							},
							headers: withCsrf(owner.csrfToken),
						},
					);
					expect(res.status(), `crear miembro candidato ${n}`).toBe(201);
					return (await res.json()) as { id: string; participantId: string };
				};
				const asisteTodo = await makeMember(1);
				const asisteMitad = await makeMember(2);

				const bulk = async (
					memberId: string,
					records: { meetingId: string; attended: boolean }[],
				) => {
					const res = await owner.ctx.post(
						`/api/communities/${community}/members/${memberId}/attendance/bulk`,
						{ data: { records }, headers: withCsrf(owner.csrfToken) },
					);
					expect(res.ok(), `bulk attendance: ${res.status()}`).toBeTruthy();
				};
				await bulk(asisteTodo.id, [
					{ meetingId: generalA, attended: true },
					{ meetingId: generalB, attended: true },
				]);
				await bulk(asisteMitad.id, [
					{ meetingId: generalA, attended: true },
					{ meetingId: generalB, attended: false },
				]);

				// 1. Con retreatId: ambos aparecen, medidos contra la comunidad
				//    (el retiro no tiene NADA sincronizado) y ordenados por tasa
				//    descendente.
				const statsRes = await owner.ctx.get(
					`/api/communities/${community}/attendance-stats?retreatId=${retreatId}`,
				);
				expect(statsRes.ok(), `stats con retreatId: ${statsRes.status()}`).toBeTruthy();
				const stats = await statsRes.json();
				expect(stats.retreatLinkedMeetingCount).toBe(0);
				const candidates = stats.unenrolledCandidates ?? [];
				const memberIds = candidates.map((c: { memberId: string }) => c.memberId);
				expect(memberIds).toContain(asisteTodo.id);
				expect(memberIds).toContain(asisteMitad.id);
				const idxTodo = memberIds.indexOf(asisteTodo.id);
				const idxMitad = memberIds.indexOf(asisteMitad.id);
				expect(idxTodo, '100% antes que 50%').toBeLessThan(idxMitad);
				const rowTodo = candidates[idxTodo];
				expect(rowTodo.attended).toBe(2);
				expect(rowTodo.total).toBe(2);
				expect(Math.round(rowTodo.ratePercent)).toBe(100);
				expect(rowTodo.frequency).toBe('high');
				expect(rowTodo.state).toBe('active_member');

				// 2. Sin retreatId el campo ni viaja: el cliente no debe pintar
				//    la sección con un payload de otro alcance.
				const plainRes = await owner.ctx.get(
					`/api/communities/${community}/attendance-stats`,
				);
				expect(plainRes.ok()).toBeTruthy();
				const plain = await plainRes.json();
				expect('unenrolledCandidates' in plain).toBe(false);

				// 3. Cualquier fila ACTIVA en el retiro cuenta como inscrito: al
				//    dar de alta a uno como servidor, sale de la lista y el otro
				//    queda.
				const enroll = await admin!.ctx.post('/api/history', {
					headers: withCsrf(admin!.csrfToken),
					data: {
						participantId: asisteTodo.participantId,
						retreatId,
						roleInRetreat: 'server',
					},
				});
				expect(enroll.status(), `enroll: ${enroll.status()}`).toBe(201);
				historyEntryId = ((await enroll.json()) as { id: string }).id;

				const afterRes = await owner.ctx.get(
					`/api/communities/${community}/attendance-stats?retreatId=${retreatId}`,
				);
				expect(afterRes.ok()).toBeTruthy();
				const after = await afterRes.json();
				const afterIds = (after.unenrolledCandidates ?? []).map(
					(c: { memberId: string }) => c.memberId,
				);
				expect(afterIds).not.toContain(asisteTodo.id);
				expect(afterIds).toContain(asisteMitad.id);
			} finally {
				if (historyEntryId) {
					await admin!.ctx
						.delete(`/api/history/${historyEntryId}`, {
							headers: withCsrf(admin!.csrfToken),
						})
						.catch(() => undefined);
				}
				for (const meetingId of createdMeetingIds) {
					await owner.ctx
						.delete(`/api/communities/meetings/${meetingId}`, {
							headers: withCsrf(owner.csrfToken),
						})
						.catch(() => undefined);
				}
				await admin!.ctx
					.delete(`/api/retreats/${retreatId}`, {
						headers: withCsrf(admin!.csrfToken),
					})
					.catch(() => undefined);
				await owner.dispose();
				await admin!.dispose();
			}
		});

	});
