import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Alta de la comunidad "Emaús Santa Clara de Asís" (Bogotá, Colombia) y de la casa
 * "Casa Espiritualidad Pedro Legaria", donde celebrarán su retiro de hombres del
 * 27 al 29 de noviembre de 2026.
 *
 * Por qué por migración y no por la app: es el camino que el proyecto ya usa para
 * cambiar datos en prod — el CI/CD la aplica en el deploy, igual que la casa de
 * Veracruz (20260906180000_AddVeracruzXxiiiHouseAndRetreat, que es el patrón de esta).
 *
 * El RETIRO y las PERSONAS NO van aquí, a propósito:
 *  - Los participantes son datos personales y este repositorio es público. Los 71
 *    registros (40 caminantes provisionales "Caminante 01..40" + 31 servidores) se
 *    cargan por el endpoint de importación desde un script que vive fuera del repo.
 *  - El retiro se crea por el API (POST /retreats) porque createRetreat siembra mesas,
 *    equipos de servicio, camisetas, inventario, plantillas de mensajes y secuencias,
 *    responsabilidades y el calendario de preparaciones — un INSERT directo se saltaría
 *    todo eso. La migration solo pone la estructura que el API no crea en bulk: la
 *    comunidad y las 58 habitaciones de la casa.
 *
 * NO importa @repo/types a propósito: el loader de migraciones de producción no puede
 * cargar paquetes del workspace con main .ts ("Unknown file extension .ts") y la
 * migración quedaría pending para siempre. Solo typeorm + uuid, con valores literales.
 *
 * Sin DDL — solo INSERT de datos → no requiere transaction = false.
 *
 * Distribución de la casa, según el documento "Descripción de habitaciones.docx" que
 * compartió el coordinador (6 alas, 58 habitaciones). Las sofácamas que menciona el
 * documento NO se montan por decisión del coordinador ("no se usan los sofacamas"):
 * cada habitación aporta las camas fijas que describe, una plaza por cama.
 *
 *   Galería                (sin piso confirmado) — 9 habitaciones de 1 cama
 *   San Ignacio de Loyola  (piso 1) — 5 de 1 cama (102-106), 2 de 2 (107, 108)
 *   San Francisco Javier   (piso 1) — 7 de 1 cama (118, 120, 121, 123, 125, 127, 129),
 *                                       4 de 2 (122, 124, 126, 128)
 *   Pedro Legaria          (piso 2) — 4 de 1 cama (202, 203, 212, 213),
 *                                       9 de 2 (201, 204-211)
 *   Empalme                (piso 2) — 3 de 1 cama (215, 216, 235)
 *   San José               (piso 2) — 1 de 1 cama (218), 14 de 2 (220-234)
 *
 * Total: 58 habitaciones, 87 camas. (El "83 personas dobles en cama" del documento no
 * cuenta las 4 camas dobles de Pedro Legaria como dos plazas; aquí cada cama del
 * documento es una plaza.)
 *
 * Todas las camas quedan con uso default "caminante": el reparto caminantes/servidores
 * es decisión de cada retiro (el equipo la ajusta desde la app).
 *
 * Pendiente de confirmar, y por eso editable desde la app:
 *   - La dirección exacta de la casa (queda "Por confirmar").
 *   - El piso real del ala Galería (queda sin piso).
 */

const COMMUNITY_NAME = 'Emaús Santa Clara de Asís';
const HOUSE_NAME = 'Casa Espiritualidad Pedro Legaria';

type RoomSpec = { roomNumber: string; beds: number };

/** Un ala de la casa: su etiqueta, su piso (null = sin confirmar) y sus habitaciones. */
const WINGS: Array<{ label: string; floor: number | null; rooms: RoomSpec[] }> = [
	{
		label: 'Galería',
		floor: null,
		rooms: [
			{ roomNumber: '3', beds: 1 },
			{ roomNumber: '5', beds: 1 },
			{ roomNumber: '16', beds: 1 },
			{ roomNumber: '17', beds: 1 },
			{ roomNumber: '18', beds: 1 },
			{ roomNumber: '19', beds: 1 },
			{ roomNumber: '20', beds: 1 },
			{ roomNumber: '21', beds: 1 },
			{ roomNumber: '22', beds: 1 },
		],
	},
	{
		label: 'San Ignacio de Loyola',
		floor: 1,
		rooms: [
			{ roomNumber: '102', beds: 1 },
			{ roomNumber: '103', beds: 1 },
			{ roomNumber: '104', beds: 1 },
			{ roomNumber: '105', beds: 1 },
			{ roomNumber: '106', beds: 1 },
			{ roomNumber: '107', beds: 2 },
			{ roomNumber: '108', beds: 2 },
		],
	},
	{
		label: 'San Francisco Javier',
		floor: 1,
		rooms: [
			{ roomNumber: '118', beds: 1 },
			{ roomNumber: '120', beds: 1 },
			{ roomNumber: '121', beds: 1 },
			{ roomNumber: '122', beds: 2 },
			{ roomNumber: '123', beds: 1 },
			{ roomNumber: '124', beds: 2 },
			{ roomNumber: '125', beds: 1 },
			{ roomNumber: '126', beds: 2 },
			{ roomNumber: '127', beds: 1 },
			{ roomNumber: '128', beds: 2 },
			{ roomNumber: '129', beds: 1 },
		],
	},
	{
		label: 'Pedro Legaria',
		floor: 2,
		rooms: [
			{ roomNumber: '201', beds: 2 },
			{ roomNumber: '202', beds: 1 },
			{ roomNumber: '203', beds: 1 },
			{ roomNumber: '204', beds: 2 },
			{ roomNumber: '205', beds: 2 },
			{ roomNumber: '206', beds: 2 },
			{ roomNumber: '207', beds: 2 },
			{ roomNumber: '208', beds: 2 },
			{ roomNumber: '209', beds: 2 },
			{ roomNumber: '210', beds: 2 },
			{ roomNumber: '211', beds: 2 },
			{ roomNumber: '212', beds: 1 },
			{ roomNumber: '213', beds: 1 },
		],
	},
	{
		label: 'Empalme',
		floor: 2,
		rooms: [
			{ roomNumber: '215', beds: 1 },
			{ roomNumber: '216', beds: 1 },
			{ roomNumber: '235', beds: 1 },
		],
	},
	{
		label: 'San José',
		floor: 2,
		rooms: [
			{ roomNumber: '218', beds: 1 },
			{ roomNumber: '220', beds: 2 },
			{ roomNumber: '221', beds: 2 },
			{ roomNumber: '222', beds: 2 },
			{ roomNumber: '224', beds: 2 },
			{ roomNumber: '225', beds: 2 },
			{ roomNumber: '226', beds: 2 },
			{ roomNumber: '227', beds: 2 },
			{ roomNumber: '228', beds: 2 },
			{ roomNumber: '229', beds: 2 },
			{ roomNumber: '230', beds: 2 },
			{ roomNumber: '231', beds: 2 },
			{ roomNumber: '232', beds: 2 },
			{ roomNumber: '233', beds: 2 },
			{ roomNumber: '234', beds: 2 },
		],
	},
];

type BedRow = { roomNumber: string; bedNumber: string; floor: number | null; floorLabel: string };

function buildBeds(): BedRow[] {
	const beds: BedRow[] = [];
	for (const wing of WINGS) {
		for (const room of wing.rooms) {
			for (let b = 1; b <= room.beds; b++) {
				beds.push({
					roomNumber: room.roomNumber,
					bedNumber: String(b),
					floor: wing.floor,
					floorLabel: wing.label,
				});
			}
		}
	}
	return beds;
}

const HOUSE_FLOOR_LABELS = {
	'1': 'Primer piso — San Ignacio de Loyola y San Francisco Javier',
	'2': 'Segundo piso — Pedro Legaria, Empalme y San José',
	Galería: 'Ala Galería (piso sin confirmar)',
};

export class AddSantaClaraCommunityAndHouse20261106120000 implements MigrationInterface {
	name = 'AddSantaClaraCommunityAndHouse20261106120000';
	timestamp = '20261106120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Idempotencia por pieza, no de golpe (lección de Veracruz: un intento previo a
		// medias no debe dejar la migración "consumida" sin corregir el resto).
		const existingCommunity = await queryRunner.query(`SELECT "id" FROM "community" WHERE "name" = ?`, [
			COMMUNITY_NAME,
		]);
		if (existingCommunity.length > 0) {
			console.log(`[AddSantaClara] la comunidad ya existía — se reutiliza`);
		} else {
			await queryRunner.query(
				`INSERT INTO "community" ("id", "name", "address1", "city", "state", "zipCode", "country")
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[uuidv4(), COMMUNITY_NAME, 'Por confirmar', 'Bogotá', 'Cundinamarca', '000000', 'Colombia'],
			);
		}

		const existingHouse = await queryRunner.query(`SELECT "id" FROM "house" WHERE "name" = ?`, [HOUSE_NAME]);
		const houseId = existingHouse[0]?.id ?? uuidv4();
		if (existingHouse.length > 0) {
			console.log(`[AddSantaClara] la casa ya existía (${houseId}) — se reutiliza`);
		} else {
			await queryRunner.query(
				`INSERT INTO "house" ("id", "name", "address1", "address2", "city", "state", "zipCode", "country",
				 "capacity", "notes", "timezone", "floorLabels")
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					houseId,
					HOUSE_NAME,
					'Por confirmar',
					null,
					'Bogotá',
					'Cundinamarca',
					'000000',
					'Colombia',
					buildBeds().length,
					'Casa de Espiritualidad de las hermanitas de Pedro Legaria. 58 habitaciones en 6 alas ' +
						'(Galería, San Ignacio de Loyola, San Francisco Javier, Pedro Legaria, Empalme y San José); ' +
						'las sofácamas del documento no se montan por decisión del equipo. Fuente: ' +
						'"Descripción de habitaciones.docx" del coordinador (nov 2026). Dirección pendiente de confirmar.',
					'America/Bogota',
					JSON.stringify(HOUSE_FLOOR_LABELS),
				],
			);
		}

		// Camas: solo si la casa no tiene ninguna — cubre el estado a medias de un intento
		// previo que creó la casa y murió antes de las camas. Si ya tiene (parcial o completo),
		// no se toca: las camas son editables desde la app y machacarlas las perdería.
		const bedCount = await queryRunner.query(`SELECT COUNT(*) AS "n" FROM "bed" WHERE "houseId" = ?`, [houseId]);
		if (Number(bedCount[0].n) > 0) {
			console.log(`[AddSantaClara] la casa ya tiene ${bedCount[0].n} camas — no se insertan`);
			console.log(
				`[AddSantaClara] listo: comunidad "${COMMUNITY_NAME}" y casa "${HOUSE_NAME}" (${houseId}) verificadas`,
			);
			return;
		}

		const beds = buildBeds();
		for (const bed of beds) {
			await queryRunner.query(
				`INSERT INTO "bed" ("id", "roomNumber", "bedNumber", "floor", "type", "defaultUsage", "houseId", "floorLabel")
				 VALUES (?, ?, ?, ?, 'normal', 'caminante', ?, ?)`,
				[uuidv4(), bed.roomNumber, bed.bedNumber, bed.floor, houseId, bed.floorLabel],
			);
		}

		console.log(
			`[AddSantaClara] comunidad "${COMMUNITY_NAME}" y casa "${HOUSE_NAME}" (${houseId}) creadas ` +
				`con ${beds.length} camas en ${WINGS.reduce((acc, w) => acc + w.rooms.length, 0)} habitaciones`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Solo revierte lo que esta migración creó, y solo si nadie lo está usando.
		// Se revisan AMBAS guardas antes de borrar cualquiera: un revert a medias
		// (casa sin comunidad) dejaría un estado que ninguna otra pieza repara.
		const house = await queryRunner.query(`SELECT "id" FROM "house" WHERE "name" = ?`, [HOUSE_NAME]);
		const community = await queryRunner.query(`SELECT "id" FROM "community" WHERE "name" = ?`, [COMMUNITY_NAME]);

		if (house.length > 0) {
			const retreats = await queryRunner.query(`SELECT COUNT(*) AS "n" FROM "retreat" WHERE "houseId" = ?`, [
				house[0].id,
			]);
			if (Number(retreats[0].n) > 0) {
				console.log(`[AddSantaClara] down(): la casa la usan ${retreats[0].n} retiros — no se borra nada`);
				return;
			}
		}
		if (community.length > 0) {
			const members = await queryRunner.query(
				`SELECT COUNT(*) AS "n" FROM "community_member" WHERE "communityId" = ?`,
				[community[0].id],
			);
			if (Number(members[0].n) > 0) {
				console.log(
					`[AddSantaClara] down(): la comunidad tiene ${members[0].n} miembros — no se borra nada`,
				);
				return;
			}
		}

		if (house.length > 0) {
			// El FK de bed es ON DELETE CASCADE, pero se borra explícito para no depender de él.
			await queryRunner.query(`DELETE FROM "bed" WHERE "houseId" = ?`, [house[0].id]);
			await queryRunner.query(`DELETE FROM "house" WHERE "id" = ?`, [house[0].id]);
		}
		if (community.length > 0) {
			await queryRunner.query(`DELETE FROM "community" WHERE "id" = ?`, [community[0].id]);
		}
		console.log('[AddSantaClara] down(): comunidad y casa eliminadas');
	}
}
