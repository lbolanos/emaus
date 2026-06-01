import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajuste de datos (NO de schema) del minuto-a-minuto del retiro "San Agustín"
 * (parish='San Agustín', startDate 2026-06-05) para alinearlo con el programa
 * oficial del Excel "Programa Retiro Polanco IV.xlsx". Un solo archivo, dos partes:
 *
 *  A) Corregir horas del Día 1 (Viernes) + resetear `delayed` -> `pending`.
 *     El MAM se materializó del template "Emaús — México" (Polanco III) y alguien
 *     usó el botón "+5" (shiftDownstream) sobre el Viernes por la noche: ese botón
 *     desplaza el item y los posteriores Y los marca `delayed` aunque el retiro no
 *     haya iniciado. Resultado: Día 1, de "Reglas/Confidencialidad" en adelante,
 *     corría 5–13 min tarde y 21 items quedaron en `delayed`. Sábado (Día 2) y
 *     Domingo (Día 3) YA coincidían con el Excel — no se tocan.
 *
 *  B) Agregar un toque de "Campana" 3 min antes de la siguiente actividad después
 *     de cada break (llamar de vuelta del descanso). 10 campanas nuevas (breaks con
 *     hueco real) + reubicación de la campana del Break 1 Día 1 (ya existía a las
 *     20:35 -> se mueve a 20:32). D1-Break2 (1 min, coincide 20:48 con la Primera
 *     Lectura) se omite: no hay hueco.
 *
 * Las horas se almacenan en UTC; la casa es America/Mexico_City (UTC-6, sin DST en
 * 2026), por eso la tarde/noche del Vie/Sáb cae en UTC 2026-06-06 y el Dom en
 * 2026-06-07. Se identifica cada item por (retreatId, day, orderInDay). Mutación
 * pura vía UPDATE/INSERT: idempotente (valores absolutos + INSERT OR IGNORE por id
 * determinista) y segura en la transacción por defecto de TypeORM (sin DDL).
 */
export class AdjustSanAgustinMamPolancoIV20260601120000 implements MigrationInterface {
	name = 'AdjustSanAgustinMamPolancoIV20260601120000';
	timestamp = '20260601120000';

	// ── Parte A: horas del Día 1 (Vie 2026-06-05). UTC (= local CDMX + 6h) en 2026-06-06.
	// up = horas del Excel Polanco IV · down = horas previas (Polanco III + "+5").
	private readonly DATE_D1 = '2026-06-06';
	private readonly CHANGES: Array<{ order: number; up: [string, string]; down: [string, string] }> =
		[
			{ order: 80, up: ['00:45:00.000', '00:55:00.000'], down: ['00:50:00.000', '01:00:00.000'] }, // Explicación de la Lectura del Camino de Emaús
			{ order: 95, up: ['01:05:00.000', '01:15:00.000'], down: ['01:10:00.000', '01:20:00.000'] }, // Reglas: confidencialidad…
			{ order: 100, up: ['01:15:00.000', '01:25:00.000'], down: ['01:20:00.000', '01:30:00.000'] }, // Asignaciones de mesa
			{ order: 105, up: ['01:25:00.000', '02:25:00.000'], down: ['01:30:00.000', '02:30:00.000'] }, // Cena
			{ order: 110, up: ['02:25:00.000', '02:35:00.000'], down: ['02:30:00.000', '02:40:00.000'] }, // Break 1
			{ order: 115, up: ['02:35:00.000', '02:40:00.000'], down: ['02:40:00.000', '02:45:00.000'] }, // La Rosa
			{ order: 120, up: ['02:40:00.000', '02:42:00.000'], down: ['02:45:00.000', '02:47:00.000'] }, // Cuadernitos
			{ order: 125, up: ['02:42:00.000', '02:45:00.000'], down: ['02:48:00.000', '02:51:00.000'] }, // Palancas
			{ order: 130, up: ['02:43:00.000', '02:48:00.000'], down: ['02:51:00.000', '02:56:00.000'] }, // Exhortación
			{ order: 135, up: ['02:48:00.000', '02:49:00.000'], down: ['02:55:00.000', '02:56:00.000'] }, // Break 2
			{ order: 140, up: ['02:48:00.000', '03:03:00.000'], down: ['03:00:00.000', '03:15:00.000'] }, // Primera Lectura
			{ order: 145, up: ['03:03:00.000', '03:07:00.000'], down: ['03:15:00.000', '03:19:00.000'] }, // Oración al Espíritu Santo
			{ order: 150, up: ['03:07:00.000', '03:52:00.000'], down: ['03:20:00.000', '04:05:00.000'] }, // Charla Conocerte
			{ order: 155, up: ['03:52:00.000', '03:57:00.000'], down: ['04:05:00.000', '04:10:00.000'] }, // Meditar
			{ order: 160, up: ['03:57:00.000', '04:07:00.000'], down: ['04:10:00.000', '04:20:00.000'] }, // Break 3
			{ order: 165, up: ['04:07:00.000', '04:52:00.000'], down: ['04:20:00.000', '05:05:00.000'] }, // Charla El Padre Amoroso
			{ order: 170, up: ['04:52:00.000', '04:57:00.000'], down: ['05:05:00.000', '05:10:00.000'] }, // Meditar
			{ order: 173, up: ['04:55:00.000', '04:57:00.000'], down: ['05:08:00.000', '05:10:00.000'] }, // Campana — pasar a la Capilla
			{ order: 175, up: ['04:57:00.000', '05:27:00.000'], down: ['05:10:00.000', '05:40:00.000'] }, // Biblias
			{ order: 180, up: ['05:27:00.000', '05:28:00.000'], down: ['05:40:00.000', '05:41:00.000'] }, // Silencio
			{ order: 185, up: ['05:27:00.000', '05:28:00.000'], down: ['05:40:00.000', '05:41:00.000'] }, // Reunión de servidores
		];

	// Items que estaban en `delayed` (todos del Día 1) por los "+5". down() los restaura.
	private readonly DELAYED_ORDERS = [
		100, 105, 110, 111, 113, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 173,
		175, 180, 185,
	];

	// ── Parte B: campanas nuevas (3 min antes de la siguiente actividad). UTC.
	private readonly BELL_NAME = 'Campana — 3 min para reanudar (fin del break)';
	private readonly BELLS: Array<{ id: string; day: number; order: number; start: string; end: string }> =
		[
			{ id: 'sa-bell-d1-b3', day: 1, order: 163, start: '2026-06-06 04:04:00.000', end: '2026-06-06 04:07:00.000' }, // tras Break 3 -> Padre Amoroso 22:07
			{ id: 'sa-bell-d2-b1', day: 2, order: 33, start: '2026-06-06 15:27:00.000', end: '2026-06-06 15:30:00.000' }, // tras Break 1 -> Resumen 09:30
			{ id: 'sa-bell-d2-b2', day: 2, order: 70, start: '2026-06-06 18:02:00.000', end: '2026-06-06 18:05:00.000' }, // tras Break 2 -> Sacramentos 12:05
			{ id: 'sa-bell-d2-b3', day: 2, order: 83, start: '2026-06-06 18:57:00.000', end: '2026-06-06 19:00:00.000' }, // tras Break 3 -> Oración 13:00
			{ id: 'sa-bell-d2-b4', day: 2, order: 113, start: '2026-06-06 21:52:00.000', end: '2026-06-06 21:55:00.000' }, // tras Break 4 -> Práctica Canción 15:55
			{ id: 'sa-bell-d2-b5', day: 2, order: 138, start: '2026-06-06 23:17:00.000', end: '2026-06-06 23:20:00.000' }, // tras Break 5 -> Cuarta Lectura 17:20
			{ id: 'sa-bell-d3-b1', day: 3, order: 33, start: '2026-06-07 16:57:00.000', end: '2026-06-07 17:00:00.000' }, // tras Break 1 -> Resumen 11:00
			{ id: 'sa-bell-d3-b2', day: 3, order: 63, start: '2026-06-07 18:37:00.000', end: '2026-06-07 18:40:00.000' }, // tras Break 2 -> Servicio 12:40
			{ id: 'sa-bell-d3-b3', day: 3, order: 83, start: '2026-06-07 19:37:00.000', end: '2026-06-07 19:40:00.000' }, // tras Break 3 -> Carta de Jesús 13:40
			{ id: 'sa-bell-d3-b4', day: 3, order: 123, start: '2026-06-07 22:22:00.000', end: '2026-06-07 22:25:00.000' }, // tras Break 4 -> Sexta Lectura 16:25
		];

	private async ctx(
		queryRunner: QueryRunner,
	): Promise<{ retreatId: string; campaneroId: string | null } | null> {
		const r = await queryRunner.query(
			`SELECT id FROM "retreat" WHERE "parish" = 'San Agustín' AND "startDate" LIKE '2026-06-05%'`,
		);
		if (!r.length) return null;
		const retreatId = r[0].id;
		const resp = await queryRunner.query(
			`SELECT id FROM "retreat_responsibilities" WHERE "retreatId" = ? AND "name" = 'Campanero'`,
			[retreatId],
		);
		return { retreatId, campaneroId: resp.length ? resp[0].id : null };
	}

	public async up(queryRunner: QueryRunner): Promise<void> {
		const ctx = await this.ctx(queryRunner);
		if (!ctx) {
			console.warn('[AdjustSanAgustinMamPolancoIV] retiro San Agustín (2026-06-05) no encontrado — no-op');
			return;
		}
		const { retreatId, campaneroId } = ctx;

		// A) Horas del Día 1 -> Excel.
		for (const c of this.CHANGES) {
			await queryRunner.query(
				`UPDATE "retreat_schedule_item" SET "startTime" = ?, "endTime" = ?
				 WHERE "retreatId" = ? AND "day" = 1 AND "orderInDay" = ?`,
				[`${this.DATE_D1} ${c.up[0]}`, `${this.DATE_D1} ${c.up[1]}`, retreatId, c.order],
			);
		}
		// A) El retiro aún no inicia: nada debería estar 'delayed'.
		await queryRunner.query(
			`UPDATE "retreat_schedule_item" SET "status" = 'pending'
			 WHERE "retreatId" = ? AND "status" = 'delayed'`,
			[retreatId],
		);

		// B) Campanas nuevas 3 min antes de la siguiente actividad.
		for (const b of this.BELLS) {
			await queryRunner.query(
				`INSERT OR IGNORE INTO "retreat_schedule_item"
					("id", "retreatId", "scheduleTemplateId", "name", "type", "day",
					 "startTime", "endTime", "durationMinutes", "orderInDay", "status",
					 "responsabilityId", "blocksSantisimoAttendance", "createdAt", "updatedAt")
				 VALUES (?, ?, NULL, ?, 'campana', ?, ?, ?, 3, ?, 'pending', ?, 0, datetime('now'), datetime('now'))`,
				[b.id, retreatId, this.BELL_NAME, b.day, b.start, b.end, b.order, campaneroId],
			);
		}
		// B) Reubicar campana existente del Break 1 Día 1 (orderInDay 113): 20:35 -> 20:32.
		await queryRunner.query(
			`UPDATE "retreat_schedule_item"
			 SET "startTime" = '2026-06-06 02:32:00.000', "endTime" = '2026-06-06 02:35:00.000', "durationMinutes" = 3
			 WHERE "retreatId" = ? AND "day" = 1 AND "orderInDay" = 113`,
			[retreatId],
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const ctx = await this.ctx(queryRunner);
		if (!ctx) return;
		const { retreatId } = ctx;

		// B) Quitar campanas nuevas y revertir reubicación del Break 1 Día 1.
		await queryRunner.query(
			`DELETE FROM "retreat_schedule_item" WHERE "id" IN (${this.BELLS.map(() => '?').join(', ')})`,
			this.BELLS.map((b) => b.id),
		);
		await queryRunner.query(
			`UPDATE "retreat_schedule_item"
			 SET "startTime" = '2026-06-06 02:35:00.000', "endTime" = '2026-06-06 02:37:00.000', "durationMinutes" = 2
			 WHERE "retreatId" = ? AND "day" = 1 AND "orderInDay" = 113`,
			[retreatId],
		);

		// A) Restaurar horas previas y status 'delayed'.
		for (const c of this.CHANGES) {
			await queryRunner.query(
				`UPDATE "retreat_schedule_item" SET "startTime" = ?, "endTime" = ?
				 WHERE "retreatId" = ? AND "day" = 1 AND "orderInDay" = ?`,
				[`${this.DATE_D1} ${c.down[0]}`, `${this.DATE_D1} ${c.down[1]}`, retreatId, c.order],
			);
		}
		for (const order of this.DELAYED_ORDERS) {
			await queryRunner.query(
				`UPDATE "retreat_schedule_item" SET "status" = 'delayed'
				 WHERE "retreatId" = ? AND "day" = 1 AND "orderInDay" = ?`,
				[retreatId, order],
			);
		}
	}
}
