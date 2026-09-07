import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Alta de la casa "Casa de la Iglesia Pbro. Miguel Castillo Pérez" (Veracruz) y del
 * retiro Emaús Hombres Veracruz XXIII (4-6 de septiembre de 2026), que se llevó en ella.
 *
 * Por qué por migración y no por la app: la parroquia de Veracruz lleva su registro en
 * emaus.mx y entrega un export, así que el retiro nunca se creó en emaus.cc. Crearlo por
 * script contra producción dejó estado a medias (el seeder de equipos de servicio falló
 * con NOT NULL en service_teams.teamType), así que esto entra por el camino que el
 * proyecto ya usa para cambiar datos en prod: el CI/CD lo aplica en el deploy.
 *
 * NO importa @repo/types a propósito: el loader de migraciones de producción no puede
 * cargar paquetes del workspace con main .ts ("Unknown file extension .ts") y la migración
 * quedaría pending para siempre. Solo typeorm + uuid, con los valores literales embebidos.
 *
 * Sin DDL — solo INSERT de datos → no requiere transaction = false.
 * Idempotente: si ya existe una casa con ese nombre o un retiro con ese slug, no hace nada.
 *
 * Los PARTICIPANTES no van aquí: son datos personales (nombres, teléfonos, correos, fechas
 * de nacimiento, medicación) y este repositorio es público. Se importan por la pantalla de
 * importación con el CSV curado que vive fuera del repo.
 *
 * Por lo mismo tampoco van los teléfonos de contacto del retiro, aunque estén impresos en el
 * volante: `contactPhones` se captura desde la app, no se versiona.
 *
 * Distribución de la casa, según lo que confirmó el coordinador y el export del 5 de sep:
 *   Módulo C — C01-C17 planta baja, C18-C32 planta alta — caminantes
 *   Módulo B — B01-B19 — caminantes
 *   Módulo D — D01-D17 planta baja, D18-D32 planta alta — servidores
 *   Módulo A — A01-A08 — servidores
 * Dos camas por habitación: 182 en total, 102 de caminante y 80 de servidor.
 *
 * PENDIENTE de confirmar con la parroquia, y por eso queda editable desde la app:
 *   - Si las habitaciones son dos camas individuales o literas (hay 11 personas de más de
 *     65 años; el reparto por edad manda a los mayores a la cama de abajo sólo si sabe que
 *     es litera).
 *   - El tamaño real del módulo B: en el export se usan hasta la B19, pero puede tener más.
 *   - Si la C11 tiene una tercera cama: el export del 5 de sep le asignó tres personas.
 */

const HOUSE_NAME = 'Casa de la Iglesia Pbro. Miguel Castillo Pérez';
const RETREAT_SLUG = 'veracruzxxiii';

/** Un piso por planta de cada módulo; el número es el orden en que se muestran. */
const FLOORS: Record<number, string> = {
	1: 'Módulo C - Planta baja',
	2: 'Módulo C - Planta alta',
	3: 'Módulo B',
	4: 'Módulo D - Planta baja',
	5: 'Módulo D - Planta alta',
	6: 'Módulo A',
};

/** prefijo, primera habitación, última, piso, uso por defecto */
const ROOM_RANGES: Array<[string, number, number, number, 'caminante' | 'servidor']> = [
	['C', 1, 17, 1, 'caminante'],
	['C', 18, 32, 2, 'caminante'],
	['B', 1, 19, 3, 'caminante'],
	['D', 1, 17, 4, 'servidor'],
	['D', 18, 32, 5, 'servidor'],
	['A', 1, 8, 6, 'servidor'],
];

const BEDS_PER_ROOM = 2;

/**
 * Camas de CAMINANTE que necesita cada habitación en ESTE retiro, donde difiere del uso normal
 * del módulo. La parroquia usó parte del módulo D para caminantes (el bloque de cuartos
 * individuales) y metió algún servidor en C y B, pero eso es de este fin de semana, no de la
 * casa: por eso la excepción se aplica al mapa de camas del retiro y la casa se queda limpia.
 *
 * El importador crea una cama sobre la marcha cuando la habitación pedida no tiene ninguna libre
 * del tipo del participante; sin estas excepciones inventaba 32 camas y dejaba habitaciones de
 * dos con tres y cuatro ocupantes.
 *
 * C11 lleva 3 porque el export le asignó tres caminantes.
 */
const RETREAT_WALKER_BEDS_BY_ROOM: Record<string, number> = {
	B06: 1, B13: 0, B16: 0, B19: 1,
	C01: 1, C04: 0, C06: 1, C11: 3, C19: 1,
	D01: 2, D02: 2, D03: 2, D04: 2, D05: 2, D06: 2, D07: 2, D08: 2,
	D17: 1, D18: 1, D19: 1, D22: 1, D23: 1, D30: 2,
};

type BedRow = { roomNumber: string; bedNumber: string; floor: number; defaultUsage: string; floorLabel: string };

function buildBeds(): BedRow[] {
	const beds: BedRow[] = [];
	for (const [prefix, from, to, floor, usage] of ROOM_RANGES) {
		for (let n = from; n <= to; n++) {
			const roomNumber = `${prefix}${String(n).padStart(2, '0')}`;
			for (let b = 1; b <= BEDS_PER_ROOM; b++) {
				beds.push({
					roomNumber,
					bedNumber: String(b),
					floor,
					defaultUsage: usage,
					floorLabel: FLOORS[floor],
				});
			}
		}
	}
	return beds;
}

export class AddVeracruzXxiiiHouseAndRetreat20260906180000 implements MigrationInterface {
	name = 'AddVeracruzXxiiiHouseAndRetreat20260906180000';
	timestamp = '20260906180000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// El retiro es lo que esta migración existe para crear: si ya está, no hay nada que hacer.
		// La casa se trata aparte a propósito. Un intento anterior por script contra producción
		// murió a medio camino (NOT NULL en service_teams.teamType) y dejó casa sin retiro; una
		// guarda que se saltara todo al ver cualquiera de los dos dejaría ese estado a medias sin
		// corregir para siempre. Aquí, si la casa está, se reutiliza en vez de duplicarla.
		const existingRetreat = await queryRunner.query(`SELECT "id" FROM "retreat" WHERE "slug" = ?`, [RETREAT_SLUG]);
		if (existingRetreat.length > 0) {
			console.log(`[AddVeracruzXxiii] el retiro ${RETREAT_SLUG} ya existe — no se hace nada`);
			return;
		}

		const beds = buildBeds();
		const existingHouse = await queryRunner.query(`SELECT "id" FROM "house" WHERE "name" = ?`, [HOUSE_NAME]);
		const houseId = existingHouse[0]?.id ?? uuidv4();
		if (existingHouse.length > 0) {
			console.log(`[AddVeracruzXxiii] la casa ya existía (${houseId}) — se reutiliza`);
		} else {
			await queryRunner.query(
			`INSERT INTO "house" ("id", "name", "address1", "address2", "city", "state", "zipCode", "country",
			 "capacity", "latitude", "longitude", "googleMapsUrl", "notes", "timezone", "floorLabels")
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				houseId,
				HOUSE_NAME,
				'Carretera Valente Díaz - Dos Lomas S/N',
				'Cercanías del Seminario Mayor San José',
				'Veracruz',
				'Veracruz',
				'91698',
				'México',
				beds.length,
				19.1570573,
				-96.2092096,
				'https://www.google.com/maps/search/?api=1&query=19.1570573%2C-96.2092096',
				'Módulos C y B para caminantes, D y A para servidores. Dos camas por habitación. ' +
					'Pendiente confirmar si son literas, el tamaño real del módulo B y si la C11 tiene una tercera cama.',
				'America/Mexico_City',
				JSON.stringify(FLOORS),
				],
			);

			for (const bed of beds) {
				await queryRunner.query(
					`INSERT INTO "bed" ("id", "roomNumber", "bedNumber", "floor", "type", "defaultUsage", "houseId", "floorLabel")
					 VALUES (?, ?, ?, ?, 'normal', ?, ?, ?)`,
					[uuidv4(), bed.roomNumber, bed.bedNumber, bed.floor, bed.defaultUsage, houseId, bed.floorLabel],
				);
			}
		}

		// El mapa de camas del RETIRO se calcula antes de insertar el retiro, porque de él salen
		// max_walkers y max_servers. Tomarlos del reparto de la casa era un error: las excepciones
		// por habitación mueven camas entre usos, así que los topes quedaban en 102/80 cuando las
		// camas reales del retiro son 115/68 — el sistema habría aceptado servidores para los que
		// no hay cama y marcado en espera a caminantes que sí la tenían.
		const houseBeds: Array<{ roomNumber: string; floor: number; type: string; defaultUsage: string; floorLabel: string }> =
			await queryRunner.query(
				`SELECT "roomNumber", "floor", "type", "defaultUsage", "floorLabel"
				 FROM "bed" WHERE "houseId" = ? ORDER BY "roomNumber", "bedNumber"`,
				[houseId],
			);
		const byRoom = new Map<string, (typeof houseBeds)[number]>();
		for (const b of houseBeds) if (!byRoom.has(b.roomNumber)) byRoom.set(b.roomNumber, b);

		const retreatBedPlan: Array<{ roomNumber: string; bedNumber: string; floor: number; type: string; usage: string; floorLabel: string }> = [];
		for (const [roomNumber, sample] of byRoom) {
			const moduleWalkerBeds = sample.defaultUsage === 'caminante' ? BEDS_PER_ROOM : 0;
			const roomWalkerBeds = RETREAT_WALKER_BEDS_BY_ROOM[roomNumber] ?? moduleWalkerBeds;
			const total = Math.max(BEDS_PER_ROOM, roomWalkerBeds);
			for (let i = 0; i < total; i++) {
				retreatBedPlan.push({
					roomNumber,
					bedNumber: String(i + 1),
					floor: sample.floor,
					type: sample.type,
					usage: i < roomWalkerBeds ? 'caminante' : 'servidor',
					floorLabel: sample.floorLabel,
				});
			}
		}
		const retreatWalkerBeds = retreatBedPlan.filter((b) => b.usage === 'caminante').length;

		const retreatId = uuidv4();
		await queryRunner.query(
			`INSERT INTO "retreat" ("id", "parish", "startDate", "endDate", "houseId", "closingNotes",
			 "thingsToBringNotes", "cost", "max_walkers", "max_servers", "isPublic",
			 "roleInvitationEnabled", "walkerArrivalTime", "retreat_type", "retreat_number_version", "slug",
			 "notifyParticipant", "notifyInviter", "santisimoEnabled", "timezone",
			 "closingChurchName", "closingChurchAddress", "closingChurchLatitude", "closingChurchLongitude",
			 "externalRegistrationUrl")
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)`,
			[
				retreatId,
				'San Miguel Arcángel',
				'2026-09-04',
				'2026-09-06',
				houseId,
				'Domingo 6 de septiembre a las 16:00, misa de clausura en la capilla de la casa. ' +
					'Es muy importante que la familia venga a recibir al caminante.',
				'Toalla. Objetos personales: desodorante, jabón, cepillo de dientes, medicinas. ' +
					'Ropa y calzado cómodo, ropa de dormir, y una sudadera o chamarra para una actividad al aire libre de noche.',
				'1500',
				retreatWalkerBeds,
				retreatBedPlan.length - retreatWalkerBeds,
				'17:00',
				'men',
				'XXIII',
				RETREAT_SLUG,
				'America/Mexico_City',
				'Capilla de la Casa de la Iglesia Pbro. Miguel Castillo Pérez',
				'Carretera Valente Díaz - Dos Lomas S/N, Col. Valente Díaz, Veracruz, Ver.',
				19.1570573,
				-96.2092096,
				'http://www.emaus.mx/veracruz/',
			],
);

		// Sin esta copia el retiro nace sin mapa de camas y el importador va inventando una por
		// cada habitación del Excel. createRetreat lo hace vía refreshRetreatBedsFromHouse.
		for (const bed of retreatBedPlan) {
			await queryRunner.query(
				`INSERT INTO "retreat_bed" ("id", "roomNumber", "bedNumber", "floor", "type", "defaultUsage",
				 "retreatId", "participantId", "isActive", "floorLabel")
				 VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?)`,
				[uuidv4(), bed.roomNumber, bed.bedNumber, bed.floor, bed.type, bed.usage, retreatId, bed.floorLabel],
			);
		}
		const retreatBedCount = retreatBedPlan.length;

		console.log(
			`[AddVeracruzXxiii] casa ${houseId} con ${beds.length} camas, retiro ${RETREAT_SLUG} y ${retreatBedCount} camas de retiro creados`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Sólo revierte lo que esta migración creó, y sólo si nadie lo está usando:
		// un retiro con participantes o una casa con otros retiros se dejan en paz.
		const retreat = await queryRunner.query(`SELECT "id", "houseId" FROM "retreat" WHERE "slug" = ?`, [RETREAT_SLUG]);
		if (retreat.length > 0) {
			const [{ n }] = await queryRunner.query(
				`SELECT COUNT(*) AS n FROM "retreat_participants" WHERE "retreatId" = ?`,
				[retreat[0].id],
			);
			if (Number(n) > 0) {
				console.log(`[AddVeracruzXxiii] down(): el retiro tiene ${n} participantes — no se borra`);
				return;
			}
			await queryRunner.query(`DELETE FROM "retreat_bed" WHERE "retreatId" = ?`, [retreat[0].id]);
			await queryRunner.query(`DELETE FROM "retreat" WHERE "id" = ?`, [retreat[0].id]);
		}

		const house = await queryRunner.query(`SELECT "id" FROM "house" WHERE "name" = ?`, [HOUSE_NAME]);
		if (house.length > 0) {
			const [{ n }] = await queryRunner.query(`SELECT COUNT(*) AS n FROM "retreat" WHERE "houseId" = ?`, [
				house[0].id,
			]);
			if (Number(n) > 0) {
				console.log(`[AddVeracruzXxiii] down(): la casa la usan ${n} retiros — no se borra`);
				return;
			}
			// El FK de bed es ON DELETE CASCADE, pero se borra explícito para no depender de él.
			await queryRunner.query(`DELETE FROM "bed" WHERE "houseId" = ?`, [house[0].id]);
			await queryRunner.query(`DELETE FROM "house" WHERE "id" = ?`, [house[0].id]);
		}
	}
}
