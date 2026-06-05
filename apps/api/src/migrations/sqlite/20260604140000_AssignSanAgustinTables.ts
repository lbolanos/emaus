import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configura las 8 mesas del retiro "San Agustín" (startDate 2026-06-05) tal cual
 * la distribución provista por el coordinador:
 *   1) Crea las mesas faltantes (Mesa 6, 7, 8) de forma idempotente (por nombre).
 *   2) Asigna LÍDER + COLÍDER 1 de cada mesa (tables.liderId / colider1Id).
 *   3) Reasigna 37 CAMINANTES a su mesa destino (retreat_participants.tableId).
 *
 * Los 5 caminantes no listados en las imágenes quedan sin mesa (sin cambios).
 * No se asigna colíder 2 (las imágenes solo muestran Líder + Colíder 1).
 * Todos los líderes/colíderes son servidores del retiro.
 *
 * Estado previo en prod (2026-06-04): 5 mesas (Mesa 1..5) con otra distribución
 * de caminantes y sin líderes. Es data-only (INSERT + UPDATE), sin recreate-table,
 * por eso no requiere transaction=false. El down() restaura el estado previo exacto
 * (caminantes a su mesa previa o NULL; líderes/colíderes de nuevo en NULL).
 */
export class AssignSanAgustinTables20260604140000 implements MigrationInterface {
	name = 'AssignSanAgustinTables20260604140000';
	timestamp = '20260604140000';

	/** Mesas que deben existir para poder asignar (idempotente por nombre). */
	private readonly MESAS_TO_ENSURE: Array<{ id: string; name: string }> = [
		{ id: '715660c5-d45a-468f-86ab-b662dab0fc4b', name: 'Mesa 6' },
		{ id: 'a639acee-3b19-467a-945a-61bc47235db5', name: 'Mesa 7' },
		{ id: 'f9b066bd-420b-4d04-bc71-96ac0408e8e1', name: 'Mesa 8' },
	];

	/** Por mesa: participantId del líder y del colíder 1. `name` es referencia humana. */
	private readonly LEADERS: Array<{
		mesa: string;
		liderId: string;
		liderName: string;
		colider1Id: string;
		colider1Name: string;
	}> = [
		{ mesa: 'Mesa 1', liderId: '6b5627d2-669a-4417-95b8-ded5f00a84f8', liderName: 'Guillermo Vazquez Castro', colider1Id: 'f2c71b0d-3e8f-4cca-9ba7-a2675e0c8fdf', colider1Name: 'Marco Flores' },
		{ mesa: 'Mesa 2', liderId: 'd2b9b69e-2a4f-4180-9bb3-a5826aa82f02', liderName: 'Horacio Xotlanihua sanchez', colider1Id: 'a850c658-ddea-4583-ba36-a05625243ffa', colider1Name: 'Luis Jaimes' },
		{ mesa: 'Mesa 3', liderId: '52e4a93e-dcc2-4665-b912-a1496ad4a484', liderName: 'Oscar Pardo', colider1Id: '935ac057-df71-4880-8ebe-426e70a52bbf', colider1Name: 'Carlos Pérez Ovilla' },
		{ mesa: 'Mesa 4', liderId: 'ee3df6d3-f628-42c5-8733-a3fdc4ce3370', liderName: 'Angelo Servalli', colider1Id: '593f8d7f-21a2-4516-9e64-871efd445823', colider1Name: 'Victor hugo Moreno' },
		{ mesa: 'Mesa 5', liderId: '34430f22-2d18-4dd9-8047-6e506d730aaf', liderName: 'Luis Fernando Gutierrez Mendoza', colider1Id: '2e9bd88f-2a6b-44fb-a8d2-a7bdf8dcc051', colider1Name: 'Oscar Martínez De Leon' },
		{ mesa: 'Mesa 6', liderId: '70a50a76-f495-49cd-8016-55572060ab1a', liderName: 'Hector Leonardo Bolanos Munoz', colider1Id: 'c277c42e-0547-46da-8afc-01183555b84d', colider1Name: 'Mario Alberto Medina Arias' },
		{ mesa: 'Mesa 7', liderId: '85c49d52-6e9d-4c73-8192-eeb460b4d8da', liderName: 'Pablo Esteban Vallejos Pelliza', colider1Id: '447582c0-7a92-4308-b09c-01d9f9411bc6', colider1Name: 'Roberto Aguirre' },
		{ mesa: 'Mesa 8', liderId: '50f8b8ee-ce61-4214-aa3c-7bb1ab5bd0a4', liderName: 'Pepe Toño Aguilar', colider1Id: 'c5c5f068-3701-49f1-8cda-a92f730034c6', colider1Name: 'Nicolás Hernández Giraldo' },
	];

	/**
	 * 37 caminantes: participantId -> { target: mesa destino (imágenes),
	 * prior: mesa previa en prod o null }. `name` es solo referencia humana.
	 */
	private readonly ASSIGNMENTS: Array<{ pid: string; name: string; target: string; prior: string | null }> = [
		// --- Mesa 1 ---
		{ pid: 'f628ed71-7b6c-482e-88f1-60792bfd39dd', name: 'ADAN BAUTISTA PÉREZ', target: 'Mesa 1', prior: 'Mesa 2' },
		{ pid: 'ca12d232-1754-424d-b193-066f2574914b', name: 'JOSE LUIS LOPEZ MORENO', target: 'Mesa 1', prior: 'Mesa 3' },
		{ pid: 'd3a65a82-99cb-45db-8d57-cea719993896', name: 'Carlos Alberto Rodríguez Arana', target: 'Mesa 1', prior: 'Mesa 4' },
		{ pid: 'dd552169-c06e-4386-baa2-0c6c04c7df24', name: 'David Sebastián García Ruiz De Velazco', target: 'Mesa 1', prior: 'Mesa 3' },
		{ pid: 'be3d96f6-b173-4ff0-a732-3102eb8ee8f7', name: 'Gerardo Aguilar fuentes', target: 'Mesa 1', prior: 'Mesa 3' },
		// --- Mesa 2 ---
		{ pid: 'ddb7e2fb-8373-42fb-b565-dc1832b9ecfc', name: 'Hugo López Miranda', target: 'Mesa 2', prior: 'Mesa 1' },
		{ pid: 'e6ec86e8-47c2-492f-8d65-549eca25f6e6', name: 'GABRIEL PERALES ESPINOSA', target: 'Mesa 2', prior: 'Mesa 4' },
		{ pid: '437d3807-4e08-45db-a4d6-53b303983cb6', name: 'JOSE ABRAHAM CALDERON ORTEGA', target: 'Mesa 2', prior: 'Mesa 1' },
		{ pid: '50d4893c-9277-4f43-9f2f-2f3ab2576569', name: 'Fabian Moreno López', target: 'Mesa 2', prior: 'Mesa 5' },
		{ pid: 'bea7c1c4-e09c-4b07-858d-807e19c201e4', name: 'Salvador Vázquez Noriega', target: 'Mesa 2', prior: 'Mesa 3' },
		// --- Mesa 3 ---
		{ pid: 'e0e7719c-97cc-4a58-895b-ca48d156792f', name: 'César Quintero Trejo', target: 'Mesa 3', prior: 'Mesa 1' },
		{ pid: '64351fbd-9016-4c51-b6b2-687abec46916', name: 'Edgar Pichardo', target: 'Mesa 3', prior: 'Mesa 2' },
		{ pid: 'bc70e43d-867e-4591-a3ac-6e44129001f7', name: 'José eduardo Suárez Lozano', target: 'Mesa 3', prior: 'Mesa 3' },
		{ pid: '9845da88-30c7-4826-bd2c-42799cebc5bd', name: 'Eduardo L Quijano', target: 'Mesa 3', prior: 'Mesa 5' },
		{ pid: 'fb9c5988-fed8-4a07-bbf2-1a4b8c81549a', name: 'Andres Torres Saldaña', target: 'Mesa 3', prior: 'Mesa 5' },
		// --- Mesa 4 ---
		{ pid: 'af804a77-43d0-4972-ad73-07fb57915db3', name: 'Javier Perez', target: 'Mesa 4', prior: null },
		{ pid: 'd005a440-57b8-4ce1-b756-a406a53faf26', name: 'Luis Felipe Salinas Núñez', target: 'Mesa 4', prior: 'Mesa 2' },
		{ pid: 'ceac62d2-43b7-4974-8726-25d32aa355ef', name: 'CARLOS SOLIS GONZALEZ', target: 'Mesa 4', prior: 'Mesa 4' },
		{ pid: 'fb04a914-c686-4c2c-bf00-74adf97c0c1a', name: 'Alfredo Rosales', target: 'Mesa 4', prior: 'Mesa 4' },
		{ pid: '8f15198c-826c-4a85-8143-38424753b8b6', name: 'Hugo Andres Rivas Guerrero', target: 'Mesa 4', prior: null },
		// --- Mesa 5 ---
		{ pid: '68ef90c3-40b6-42b4-afef-c24e1df34edc', name: 'Sergio Rivadeneyra Martell', target: 'Mesa 5', prior: 'Mesa 3' },
		{ pid: 'd3500b17-de69-4936-8272-201ab36a1fe8', name: 'Elio Alberto Domador', target: 'Mesa 5', prior: 'Mesa 1' },
		{ pid: '6afc5037-8161-40ed-bac1-11f1228b2238', name: 'Jonathan Herrera', target: 'Mesa 5', prior: 'Mesa 5' },
		{ pid: '02ef71ae-f9c9-4f74-a796-6bdebc74f2a7', name: 'Antonio González Olivarez', target: 'Mesa 5', prior: 'Mesa 1' },
		{ pid: '23f2fdd7-667f-4a97-b40d-4d85e3c45021', name: 'JAIME DAVID MANTILLA FLOREZ', target: 'Mesa 5', prior: 'Mesa 4' },
		// --- Mesa 6 ---
		{ pid: '169d9639-dbbd-4174-9d63-3868e5db946e', name: 'Erik Tellez', target: 'Mesa 6', prior: 'Mesa 2' },
		{ pid: 'bb315dbb-9ff7-4254-9d02-90c68ba5b185', name: 'Jaime Abel Díaz Salguero', target: 'Mesa 6', prior: 'Mesa 5' },
		{ pid: '9f9390e8-0b56-49b7-be61-de04b92e091a', name: 'Othon Frias', target: 'Mesa 6', prior: 'Mesa 4' },
		{ pid: '7725ccdf-aa60-46e5-9259-ae18bdbb4b84', name: 'Emilio De Juambelz', target: 'Mesa 6', prior: 'Mesa 2' },
		// --- Mesa 7 ---
		{ pid: '54d4c130-3c0d-4ce6-aaf8-7e894f2a031c', name: 'Juan Santiago Morales', target: 'Mesa 7', prior: 'Mesa 3' },
		{ pid: 'e0d1c781-9261-4fcf-9a5b-d798cd4b0faa', name: 'Carlos Enrique Guerrero Mena', target: 'Mesa 7', prior: null },
		{ pid: 'dcaa0ddd-6038-4e04-b96f-397d16fd1371', name: 'Daniel Alejandro Zurita Gutiérrez', target: 'Mesa 7', prior: 'Mesa 1' },
		{ pid: '0e2604c9-34e8-4a91-9526-6136c7260837', name: 'JULIO CESAR AGUILAR BENITEZ', target: 'Mesa 7', prior: 'Mesa 4' },
		// --- Mesa 8 ---
		{ pid: 'e275a590-dcd2-4718-ab7e-fcd270f52e0b', name: 'Luis Eduardo Castillo Portilla', target: 'Mesa 8', prior: 'Mesa 2' },
		{ pid: '068e23d0-34d9-4eb1-8df3-f2ba1ee4108f', name: 'OSCAR VALLE GARCIA', target: 'Mesa 8', prior: 'Mesa 2' },
		{ pid: '95652db4-67e3-4a20-8b32-daf3a04f36a0', name: 'Julio Ascencio', target: 'Mesa 8', prior: 'Mesa 5' },
		{ pid: 'bb597d26-a4da-4534-912b-618a49566efe', name: 'Jonnatan Ojeda tenza', target: 'Mesa 8', prior: 'Mesa 1' },
	];

	private async getRetreatId(queryRunner: QueryRunner): Promise<string> {
		const rows = await queryRunner.query(
			`SELECT "id" FROM "retreat" WHERE "parish" = 'San Agustín' AND "startDate" LIKE '2026-06-05%'`,
		);
		if (!rows || rows.length !== 1) {
			throw new Error(
				`AssignSanAgustinTables: se esperaba exactamente 1 retiro "San Agustín" (2026-06-05), se encontraron ${rows?.length ?? 0}`,
			);
		}
		return rows[0].id;
	}

	/** Asigna `tableId` (por nombre de mesa) a un caminante del retiro. mesa=null => sin mesa. */
	private async setWalkerTable(
		queryRunner: QueryRunner,
		retreatId: string,
		participantId: string,
		mesaName: string | null,
	): Promise<void> {
		if (mesaName === null) {
			await queryRunner.query(
				`UPDATE "retreat_participants" SET "tableId" = NULL
				 WHERE "retreatId" = ? AND "participantId" = ? AND "type" = 'walker'`,
				[retreatId, participantId],
			);
			return;
		}
		await queryRunner.query(
			`UPDATE "retreat_participants"
			 SET "tableId" = (SELECT "id" FROM "tables" WHERE "retreatId" = ? AND "name" = ?)
			 WHERE "retreatId" = ? AND "participantId" = ? AND "type" = 'walker'`,
			[retreatId, mesaName, retreatId, participantId],
		);
	}

	public async up(queryRunner: QueryRunner): Promise<void> {
		const retreatId = await this.getRetreatId(queryRunner);

		// 1) Asegurar que existan Mesa 6, 7, 8 (idempotente por nombre dentro del retiro).
		for (const m of this.MESAS_TO_ENSURE) {
			await queryRunner.query(
				`INSERT INTO "tables" ("id", "name", "retreatId")
				 SELECT ?, ?, ?
				 WHERE NOT EXISTS (SELECT 1 FROM "tables" WHERE "retreatId" = ? AND "name" = ?)`,
				[m.id, m.name, retreatId, retreatId, m.name],
			);
		}

		// 2) Asignar líder + colíder 1 de cada mesa.
		for (const l of this.LEADERS) {
			await queryRunner.query(
				`UPDATE "tables" SET "liderId" = ?, "colider1Id" = ?
				 WHERE "retreatId" = ? AND "name" = ?`,
				[l.liderId, l.colider1Id, retreatId, l.mesa],
			);
		}

		// 3) Asignar cada caminante a su mesa destino.
		for (const a of this.ASSIGNMENTS) {
			await this.setWalkerTable(queryRunner, retreatId, a.pid, a.target);
		}

		console.log(
			`AssignSanAgustinTables: ${this.LEADERS.length} mesas con líder+colíder y ${this.ASSIGNMENTS.length} caminantes asignados en San Agustín (${retreatId}).`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const retreatId = await this.getRetreatId(queryRunner);

		// Restaurar caminantes a su mesa previa (o NULL).
		for (const a of this.ASSIGNMENTS) {
			await this.setWalkerTable(queryRunner, retreatId, a.pid, a.prior);
		}

		// Restaurar líderes/colíderes a NULL (estado previo).
		for (const l of this.LEADERS) {
			await queryRunner.query(
				`UPDATE "tables" SET "liderId" = NULL, "colider1Id" = NULL
				 WHERE "retreatId" = ? AND "name" = ?`,
				[retreatId, l.mesa],
			);
		}

		// NOTA: no se eliminan Mesa 6/7/8 (borrarlas sería destructivo si luego les
		// asignan otros datos). Revertir asignaciones es suficiente para el estado previo.
		console.log(
			`AssignSanAgustinTables: revertidas asignaciones de caminantes y líderes en San Agustín (${retreatId}).`,
		);
	}
}
