import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consolida en una sola migración todas las mejoras del módulo de
 * Inventario hechas en mayo 2026:
 *
 * 1. Sembrar inventario manuscrito del retiro San Agustín (Polanco IV,
 *    2026-06-05) — 52 items con `currentQuantity` y notas.
 * 2. Recrear `retreat_inventory` con:
 *    - `inventoryItemId` ahora NULLABLE (FK ON DELETE SET NULL).
 *    - `boxLabel`, `status` para workflow (pending/packed/onsite/consumed/returned).
 *    - `customName`, `customUnit`, `customCategoryId` para items ad-hoc
 *      (one-off por retiro, sin tocar catálogo global).
 *    - `retreatShirtTypeId` + `shirtSize` para vincular a tipos de
 *      playera configurados por retiro.
 * 3. Crear tabla `retreat_inventory_history` (audit log).
 * 4. Insertar 15 items nuevos al catálogo global derivados del JPEG.
 * 5. Corregir typos en el catálogo (Cofeemate → Coffee Mate, etc.).
 * 6. Recalcular `requiredQuantity` + `isSufficient` para TODAS las
 *    filas usando `max_walkers` cuando no haya caminantes inscritos.
 * 7. Sincronizar camisetas: migrar las cantidades de los 15 items
 *    hardcoded "Camisetas Blancas/Azules/Chamarras Talla X" al nuevo
 *    sistema basado en `RetreatShirtType`, y desactivar los items
 *    hardcoded en el catálogo global.
 *
 * Requiere `transaction = false` por el patrón recreate-table
 * (PRAGMA foreign_keys OFF se ignora dentro de transacciones TypeORM).
 *
 * IMPORTANTE: hacer backup antes:
 *   cp apps/api/database.sqlite apps/api/database.sqlite.bak-pre-inventory-bundle
 */
export class InventoryEnhancementsBundle20260512000000 implements MigrationInterface {
	name = 'InventoryEnhancementsBundle20260512000000';
	timestamp = '20260512000000';
	transaction = false;

	private readonly SAN_AGUSTIN_ID = '4c8173c9-a068-4efe-a936-e3618523bead';

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('[InventoryEnhancementsBundle] start');

		// ════════════════════════════════════════════════════════════════
		// 1) Fix typos en catálogo
		// ════════════════════════════════════════════════════════════════
		const typoFixes: { from: string; to: string }[] = [
			{ from: 'Cofeemate (sustituto de crema)', to: 'Coffee Mate (sustituto de crema)' },
			{ from: 'Cholocates minis para palanquitas', to: 'Chocolates minis para palanquitas' },
			{ from: 'Cajas de Te variados', to: 'Cajas de Té variados' },
			{
				from: 'Bolsa de carton (Son las bolsas de salida)',
				to: 'Bolsa de cartón (son bolsas de salida)',
			},
			{ from: 'Botella de valentina', to: 'Botella de Valentina' },
			{ from: 'cIproxina, tabletas 500 mg', to: 'Ciproxina, tabletas 500 mg' },
			{
				from: 'Bolsas indivudales de paquetes de Kleenex',
				to: 'Bolsas individuales de paquetes de Kleenex',
			},
			{ from: 'Bolsas de palpel grandes para Salida.', to: 'Bolsas de papel grandes para Salida' },
			{ from: 'Refrescos de 2 litros Ligth.', to: 'Refrescos de 2 litros Light' },
			{ from: 'Refrescos de 2 litros Sabor.', to: 'Refrescos de 2 litros Sabor' },
		];
		let renamed = 0;
		for (const fix of typoFixes) {
			const exists: { c: number }[] = await queryRunner.query(
				`SELECT COUNT(*) AS c FROM inventory_item WHERE name = ?`,
				[fix.to],
			);
			if (exists[0]?.c > 0) continue;
			await queryRunner.query(
				`UPDATE inventory_item SET name = ?, updatedAt = datetime('now') WHERE name = ?`,
				[fix.to, fix.from],
			);
			const changes = await queryRunner.query(`SELECT changes() AS n`);
			renamed += changes[0]?.n ?? 0;
		}
		console.log(`[InventoryEnhancementsBundle] ${renamed} typo(s) corregidos en catálogo`);

		// ════════════════════════════════════════════════════════════════
		// 2) Agregar 15 items nuevos al catálogo (JPEG San Agustín)
		// ════════════════════════════════════════════════════════════════
		const categoryRows: { id: string; name: string }[] = await queryRunner.query(
			`SELECT id, name FROM inventory_category`,
		);
		const teamRows: { id: string; name: string }[] = await queryRunner.query(
			`SELECT id, name FROM inventory_team`,
		);
		const catId = (n: string): string => {
			const c = categoryRows.find((r) => r.name === n);
			if (!c) throw new Error(`Falta categoría '${n}'`);
			return c.id;
		};
		const teamId = (n: string): string => {
			const t = teamRows.find((r) => r.name === n);
			if (!t) throw new Error(`Falta team '${n}'`);
			return t.id;
		};

		const newCatalogItems = [
			{ name: 'Ventilador', cat: 'Material Requerido', team: 'Salón', unit: 'piezas', req: 1 },
			{ name: 'Bases para letreros', cat: 'Material Requerido', team: 'Papelería', unit: 'piezas', req: 1 },
			{ name: 'Etiquetas grandes para gafetes', cat: 'Papelería', team: 'Papelería', unit: 'paquetes', req: 3 },
			{ name: 'Etiquetas chicas para gafetes', cat: 'Papelería', team: 'Papelería', unit: 'paquetes', req: 2 },
			{ name: 'Protectores de hojas', cat: 'Papelería', team: 'Papelería', unit: 'paquetes', req: 2 },
			{ name: 'Carpeta', cat: 'Papelería', team: 'Papelería', unit: 'piezas', req: 1 },
			{ name: 'Grapas y ligas (bolsa)', cat: 'Papelería', team: 'Papelería', unit: 'bolsa', req: 1 },
			{ name: 'Duck tape', cat: 'Papelería', team: 'Papelería', unit: 'piezas', req: 1 },
			{ name: 'Cuerdas para porta gafete', cat: 'Material Requerido', team: 'Recepción', unit: 'piezas', req: 30 },
			{ name: 'Clips (bolsa)', cat: 'Papelería', team: 'Papelería', unit: 'bolsa', req: 1 },
			{ name: 'Mantelitos', cat: 'Material Requerido', team: 'Comedor', unit: 'piezas', req: 10 },
			{ name: 'Micas de tiempos', cat: 'Material Requerido', team: 'Papelería', unit: 'piezas', req: 1 },
			{ name: 'Servilletas', cat: 'Snacks', team: 'Caminantes', unit: 'paquete', req: 2 },
			{ name: 'Extensiones eléctricas', cat: 'Material Requerido', team: 'Salón', unit: 'piezas', req: 2 },
			{ name: 'Kit de quema', cat: 'Quema De Pecados', team: 'Quema De Pecados', unit: 'kit', req: 1 },
		];
		for (const it of newCatalogItems) {
			await queryRunner.query(
				`
				INSERT INTO inventory_item
					(id, name, categoryId, teamId, ratio, requiredQuantity, unit, isCalculated, isActive, createdAt, updatedAt)
				SELECT
					lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
					?, ?, ?, 0.01, ?, ?, 0, 1, datetime('now'), datetime('now')
				WHERE NOT EXISTS (SELECT 1 FROM inventory_item WHERE name = ?)
				`,
				[it.name, catId(it.cat), teamId(it.team), it.req, it.unit, it.name],
			);
		}
		console.log(`[InventoryEnhancementsBundle] ${newCatalogItems.length} item(s) nuevos en catálogo`);

		// ════════════════════════════════════════════════════════════════
		// 3) Recreate retreat_inventory con nuevas columnas
		// ════════════════════════════════════════════════════════════════
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		await queryRunner.query(`
			CREATE TABLE "retreat_inventory_new" (
				"id" varchar(36) PRIMARY KEY NOT NULL,
				"retreatId" varchar(36) NOT NULL,
				"inventoryItemId" varchar(36),
				"requiredQuantity" decimal(10,2) NOT NULL DEFAULT 0,
				"currentQuantity" decimal(10,2) NOT NULL DEFAULT 0,
				"isSufficient" boolean NOT NULL DEFAULT 0,
				"notes" text,
				"boxLabel" varchar,
				"status" varchar NOT NULL DEFAULT 'pending',
				"customName" varchar,
				"customUnit" varchar,
				"customCategoryId" varchar(36),
				"retreatShirtTypeId" varchar(36),
				"shirtSize" varchar,
				"createdAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("retreatId") REFERENCES "retreat"("id") ON DELETE CASCADE,
				FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_item"("id") ON DELETE SET NULL,
				FOREIGN KEY ("customCategoryId") REFERENCES "inventory_category"("id") ON DELETE SET NULL,
				FOREIGN KEY ("retreatShirtTypeId") REFERENCES "retreat_shirt_type"("id") ON DELETE CASCADE
			)
		`);

		// Copiar datos. La tabla vieja no tiene boxLabel/status/etc (BD fresca).
		// Defaults: status='pending', isSufficient recalculado.
		await queryRunner.query(`
			INSERT INTO "retreat_inventory_new"
				(id, retreatId, inventoryItemId, requiredQuantity, currentQuantity, isSufficient, notes, status, createdAt, updatedAt)
			SELECT
				id, retreatId, inventoryItemId, requiredQuantity, currentQuantity,
				CASE WHEN COALESCE(requiredQuantity, 0) <= 0 OR COALESCE(currentQuantity, 0) >= COALESCE(requiredQuantity, 0) THEN 1 ELSE 0 END,
				notes, 'pending', createdAt, updatedAt
			FROM "retreat_inventory"
		`);

		await queryRunner.query(`DROP TABLE "retreat_inventory"`);
		await queryRunner.query(`ALTER TABLE "retreat_inventory_new" RENAME TO "retreat_inventory"`);
		await queryRunner.query(
			`CREATE INDEX "idx_retreat_inventory_retreatId" ON "retreat_inventory" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_retreat_inventory_inventoryItemId" ON "retreat_inventory" ("inventoryItemId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_retreat_inventory_retreatShirtTypeId" ON "retreat_inventory" ("retreatShirtTypeId")`,
		);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);
		console.log('[InventoryEnhancementsBundle] retreat_inventory recreado');

		// ════════════════════════════════════════════════════════════════
		// 4) Crear tabla audit log
		// ════════════════════════════════════════════════════════════════
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "retreat_inventory_history" (
				"id" varchar PRIMARY KEY NOT NULL,
				"retreatInventoryId" varchar NOT NULL,
				"retreatId" varchar NOT NULL,
				"inventoryItemId" varchar,
				"field" varchar NOT NULL,
				"oldValue" text,
				"newValue" text,
				"userId" varchar,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY ("retreatInventoryId") REFERENCES "retreat_inventory" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_inventory_history_retreat" ON "retreat_inventory_history" ("retreatId", "createdAt" DESC)`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_inventory_history_item" ON "retreat_inventory_history" ("retreatInventoryId", "createdAt" DESC)`,
		);
		console.log('[InventoryEnhancementsBundle] tabla retreat_inventory_history creada');

		// ════════════════════════════════════════════════════════════════
		// 5) Sembrar inventario JPEG de San Agustín
		// ════════════════════════════════════════════════════════════════
		const retreatExists: { c: number }[] = await queryRunner.query(
			`SELECT COUNT(*) AS c FROM retreat WHERE id = ?`,
			[this.SAN_AGUSTIN_ID],
		);
		if (retreatExists[0]?.c > 0) {
			const jpegInventory: Record<string, number> = {
				Ventilador: 1,
				'Bases para letreros': 1,
				Guillotinas: 1,
				'Etiquetas grandes para gafetes': 3,
				'Etiquetas chicas para gafetes': 2,
				'Protectores de hojas': 2,
				Carpeta: 1,
				'Gafetes Porta gafetes Plástico': 60,
				'Grapas y ligas (bolsa)': 1,
				'Duck tape': 1,
				'Masking Tape Grueso (Cables Piso)': 1,
				'Cinta Canela Café': 2,
				Pluma: 30,
				Tijeras: 4,
				'Marcadores y Plumas': 6,
				'Cuerdas para porta gafete': 30,
				'Bolsas Zip Lock Sándwich': 4,
				Veladoras: 1,
				'Clips (bolsa)': 1,
				Encendedores: 1,
				Engrapadoras: 2,
				Mantelitos: 10,
				'Micas de tiempos': 1,
				'Hojas Blancas': 100,
				'Sobres Blancos Grandes Oficio No. 10': 100,
				'Sobres para Palancas': 18,
				'Kleenex: Paquetitos Individuales': 12,
				Biblias: 8,
				Cuadernitos: 18,
				'Juego Palanquitas X Caminante': 1,
				'Coffee Mate (sustituto de crema)': 1,
				'Cajas de Té variados': 1,
				'Platos desechables grandes para poner snacks': 1,
				Cucharitas: 1,
				Servilletas: 2,
				'Botella de Valentina': 1,
				'Botella de Chamoy o Miguelito': 2,
				'Extensiones eléctricas': 2,
				'Bolsas de basura grandes': 1,
				'Banners: Invocación Al Espíritu Santo': 4,
				'Banners: Confidencialidad': 1,
				'Banners: Jesucristo Ha Resucitado': 1,
				'Banners: Divina Misericordia': 1,
				'Banners: Rembrandt Hijo Pródigo': 1,
				'Banner / Cuadro Virgen de Guadalupe': 1,
				'Kit de quema': 1,
				'Vasos desechables': 1,
				Campanas: 2,
				'Bolsas Salida': 2,
				'Camisetas Blancas Talla M': 3,
				'Camisetas Blancas Talla G': 3,
				'Camisetas Blancas Talla X': 1,
			};
			const impreciseItems = new Set<string>([
				'Platos desechables grandes para poner snacks',
				'Cucharitas',
				'Servilletas',
				'Coffee Mate (sustituto de crema)',
				'Cajas de Té variados',
				'Bolsas de basura grandes',
			]);
			const NOTE_DEFAULT = 'Inventario manuscrito 2026-05-11';
			const NOTE_IMPRECISE = 'Inventario manuscrito 2026-05-11 - verificar cantidad';

			for (const [itemName, qty] of Object.entries(jpegInventory)) {
				const note = impreciseItems.has(itemName) ? NOTE_IMPRECISE : NOTE_DEFAULT;
				// INSERT si no existe; si existe y currentQuantity es 0, UPDATE.
				await queryRunner.query(
					`
					INSERT INTO retreat_inventory
						(id, retreatId, inventoryItemId, requiredQuantity, currentQuantity, isSufficient, notes, status, createdAt, updatedAt)
					SELECT
						lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
						?, ii.id, 0, ?, 0, ?, 'pending', datetime('now'), datetime('now')
					FROM inventory_item ii
					WHERE ii.name = ?
						AND NOT EXISTS (
							SELECT 1 FROM retreat_inventory ri
							WHERE ri.retreatId = ? AND ri.inventoryItemId = ii.id
						)
					`,
					[this.SAN_AGUSTIN_ID, qty, note, itemName, this.SAN_AGUSTIN_ID],
				);
				await queryRunner.query(
					`
					UPDATE retreat_inventory
					SET currentQuantity = ?, notes = ?, updatedAt = datetime('now')
					WHERE retreatId = ?
						AND inventoryItemId = (SELECT id FROM inventory_item WHERE name = ?)
						AND currentQuantity = 0
						AND (notes IS NULL OR notes = '')
					`,
					[qty, note, this.SAN_AGUSTIN_ID, itemName],
				);
			}
			console.log(
				`[InventoryEnhancementsBundle] ${Object.keys(jpegInventory).length} items JPEG sembrados en San Agustín`,
			);
		} else {
			console.warn(
				`[InventoryEnhancementsBundle] Retiro San Agustín ${this.SAN_AGUSTIN_ID} no existe — saltando seed`,
			);
		}

		// ════════════════════════════════════════════════════════════════
		// 6) Sincronizar camisetas con shirt types del retiro
		//    Para cada retiro × cada RetreatShirtType × cada talla:
		//    crear fila retreat_inventory con retreatShirtTypeId+shirtSize.
		//    Migrar cantidades de items hardcoded a las nuevas filas.
		// ════════════════════════════════════════════════════════════════
		type ShirtRow = {
			id: string;
			retreatId: string;
			name: string;
			availableSizes: string | null;
			sortOrder: number;
		};
		const shirtTypes: ShirtRow[] = await queryRunner.query(
			`SELECT id, retreatId, name, availableSizes, sortOrder FROM retreat_shirt_type ORDER BY retreatId, sortOrder ASC, createdAt ASC`,
		);

		// Crear filas (tipo × talla) para cada retiro
		let created = 0;
		for (const t of shirtTypes) {
			let sizes: string[] = [];
			try {
				sizes = t.availableSizes ? JSON.parse(t.availableSizes) : [];
			} catch {
				sizes = [];
			}
			for (const size of sizes) {
				const customName = `${t.name} · Talla ${size}`;
				await queryRunner.query(
					`
					INSERT INTO retreat_inventory
						(id, retreatId, inventoryItemId, requiredQuantity, currentQuantity, isSufficient, notes, status, customName, customUnit, retreatShirtTypeId, shirtSize, createdAt, updatedAt)
					SELECT
						lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
						?, NULL, 0, 0, 1, NULL, 'pending', ?, 'piezas', ?, ?, datetime('now'), datetime('now')
					WHERE NOT EXISTS (
						SELECT 1 FROM retreat_inventory
						WHERE retreatId = ? AND retreatShirtTypeId = ? AND shirtSize = ?
					)
					`,
					[t.retreatId, customName, t.id, size, t.retreatId, t.id, size],
				);
				const changes = await queryRunner.query(`SELECT changes() AS n`);
				created += changes[0]?.n ?? 0;
			}
		}
		console.log(`[InventoryEnhancementsBundle] ${created} filas (shirtType × talla) creadas`);

		// Migrar cantidades de items hardcoded a las nuevas filas
		// Heurística: nombre del item viejo → tipo más probable + talla
		// - "Camisetas Blancas Talla X" → primer tipo blanco (por sortOrder) + talla X
		// - "Camisetas Azules Talla X" → primer tipo azul + talla X
		// - "Chamarras Talla X" → primer tipo chamarra + talla X
		type OldShirt = {
			id: string;
			retreatId: string;
			currentQuantity: number;
			notes: string | null;
			itemName: string;
			calculationType: string;
			tshirtSize: string;
		};
		const oldShirtRows: OldShirt[] = await queryRunner.query(`
			SELECT ri.id, ri.retreatId, ri.currentQuantity, ri.notes,
				ii.name AS itemName, ii.calculationType, ii.tshirtSize
			FROM retreat_inventory ri
			INNER JOIN inventory_item ii ON ii.id = ri.inventoryItemId
			WHERE ii.isCalculated = 1
				AND ii.calculationType IN ('tshirt', 'bluetshirt', 'jacket')
				AND ri.currentQuantity > 0
		`);
		// Mapa retreatId → tipo por keyword (lowercase) → shirtType row
		const tipoLookup = new Map<string, { white?: ShirtRow; blue?: ShirtRow; jacket?: ShirtRow }>();
		for (const t of shirtTypes) {
			const key = t.retreatId;
			const slot = tipoLookup.get(key) ?? {};
			const lower = t.name.toLowerCase();
			if (!slot.white && /(blanca|blanco|white)/.test(lower)) slot.white = t;
			if (!slot.blue && /(azul|blue)/.test(lower)) slot.blue = t;
			if (!slot.jacket && /(chamarra|jacket)/.test(lower)) slot.jacket = t;
			tipoLookup.set(key, slot);
		}
		let migrated = 0;
		for (const old of oldShirtRows) {
			const slot = tipoLookup.get(old.retreatId) ?? {};
			let target: ShirtRow | undefined;
			if (old.calculationType === 'tshirt') target = slot.white;
			else if (old.calculationType === 'bluetshirt') target = slot.blue;
			else if (old.calculationType === 'jacket') target = slot.jacket;
			if (!target) continue;
			// Sumar cantidad a la fila correspondiente
			await queryRunner.query(
				`
				UPDATE retreat_inventory
				SET currentQuantity = currentQuantity + ?,
					notes = COALESCE(NULLIF(notes, ''), ?) || CASE WHEN notes IS NOT NULL AND notes != '' THEN ' / ' || ? ELSE '' END,
					updatedAt = datetime('now')
				WHERE retreatId = ? AND retreatShirtTypeId = ? AND shirtSize = ?
				`,
				[old.currentQuantity, old.notes ?? '', old.notes ?? '', old.retreatId, target.id, old.tshirtSize],
			);
			const changes = await queryRunner.query(`SELECT changes() AS n`);
			migrated += changes[0]?.n ?? 0;
		}
		console.log(
			`[InventoryEnhancementsBundle] ${migrated} cantidades de camisetas migradas a las nuevas filas`,
		);

		// Borrar las filas viejas de retreat_inventory que apuntaban a items isCalculated
		const deletedOld = await queryRunner.query(`
			DELETE FROM retreat_inventory
			WHERE inventoryItemId IN (
				SELECT id FROM inventory_item WHERE isCalculated = 1 AND calculationType IN ('tshirt', 'bluetshirt', 'jacket')
			)
		`);
		const delCount = await queryRunner.query(`SELECT changes() AS n`);
		console.log(`[InventoryEnhancementsBundle] ${delCount[0]?.n ?? 0} filas legacy de camisetas eliminadas`);

		// Desactivar los items hardcoded del catálogo global
		await queryRunner.query(`
			UPDATE inventory_item SET isActive = 0, updatedAt = datetime('now')
			WHERE isCalculated = 1 AND calculationType IN ('tshirt', 'bluetshirt', 'jacket')
		`);

		// ════════════════════════════════════════════════════════════════
		// 7) Recalcular requiredQuantity + isSufficient para TODAS las filas
		//    Base = MAX(walkers_activos, max_walkers, 0)
		// ════════════════════════════════════════════════════════════════
		await queryRunner.query(`
			UPDATE "retreat_inventory" AS ri
			SET
				"requiredQuantity" = COALESCE(
					(
						SELECT
							CASE
								WHEN ii."isCalculated" = 1 THEN ri."requiredQuantity"
								WHEN ii."requiredQuantity" IS NOT NULL THEN ii."requiredQuantity"
								ELSE ROUND(
									ii."ratio" * MAX(
										COALESCE((
											SELECT COUNT(*) FROM "retreat_participants" rp
											WHERE rp."retreatId" = ri."retreatId"
												AND rp."type" = 'walker'
												AND rp."isCancelled" = 0
										), 0),
										COALESCE(r."max_walkers", 0),
										0
									),
									2
								)
							END
						FROM "inventory_item" ii
						INNER JOIN "retreat" r ON r."id" = ri."retreatId"
						WHERE ii."id" = ri."inventoryItemId"
					),
					ri."requiredQuantity"
				),
				"updatedAt" = datetime('now')
			WHERE ri."inventoryItemId" IS NOT NULL
		`);
		await queryRunner.query(`
			UPDATE "retreat_inventory"
			SET "isSufficient" = CASE
				WHEN COALESCE("requiredQuantity", 0) <= 0 THEN 1
				WHEN COALESCE("currentQuantity", 0) >= COALESCE("requiredQuantity", 0) THEN 1
				ELSE 0
			END
		`);
		const finalCount: { c: number }[] = await queryRunner.query(
			`SELECT COUNT(*) AS c FROM "retreat_inventory"`,
		);
		console.log(
			`[InventoryEnhancementsBundle] ${finalCount[0]?.c ?? 0} filas con requiredQuantity/isSufficient actualizados`,
		);

		// ════════════════════════════════════════════════════════════════
		// 8) Overrides por retiro: ratioOverride, requiredQtyOverride, isExcluded
		//    SQLite permite ADD COLUMN nullable o con DEFAULT sin recrear tabla.
		// ════════════════════════════════════════════════════════════════
		const overrideCols = [
			`ALTER TABLE "retreat_inventory" ADD COLUMN "ratioOverride" decimal(10,2) NULL`,
			`ALTER TABLE "retreat_inventory" ADD COLUMN "requiredQtyOverride" decimal(10,2) NULL`,
			`ALTER TABLE "retreat_inventory" ADD COLUMN "isExcluded" boolean NOT NULL DEFAULT 0`,
		];
		for (const sql of overrideCols) {
			try {
				await queryRunner.query(sql);
			} catch {
				// Columna ya existe (idempotente)
			}
		}
		console.log('[InventoryEnhancementsBundle] columnas override agregadas a retreat_inventory');

		// ════════════════════════════════════════════════════════════════
		// 9) Correcciones de ratios y cantidades fijas del catálogo global
		//    basadas en revisión operativa (mayo 2026).
		// ════════════════════════════════════════════════════════════════
		const ratioFixes: {
			name: string;
			ratio?: number;
			requiredQuantity?: number | null;
		}[] = [
			// Bolsas Salida: fijo=1 no tiene sentido (1 bolsa total). Debe ser 1 por caminante.
			{ name: 'Bolsas Salida', ratio: 1, requiredQuantity: null },
			// CDs: Etiquetas: ratio=0.01 → solo 1 etiqueta para 60 personas. 1 etiqueta por caminante.
			{ name: 'CDs: Etiquetas', ratio: 1, requiredQuantity: null },
			// Cuerdas porta gafete: fijo=30 insuficiente para 60+ participantes. 1 por participante.
			{ name: 'Cuerdas para porta gafete', ratio: 1, requiredQuantity: null },
			// Agua: ratio=1 → 1L por caminante (~60L para 60 personas). Suficiente para el fin de semana.
			{ name: 'Agua', ratio: 1 },
			// Vasos desechables: 0.69 → 42 vasos para 60 personas es muy bajo. 6 por persona.
			{ name: 'Vasos desechables', ratio: 6 },
			// Vasos para café: mismo problema que vasos desechables.
			{ name: 'Vasos para café', ratio: 6 },
			// Cucharitas: 1.67 → 101 para 60. Corrección a 6 por persona (3 cafés/día × 2 días).
			{ name: 'Cucharitas', ratio: 6 },
		];

		let ratioFixed = 0;
		for (const fix of ratioFixes) {
			const sets: string[] = [];
			const params: (number | string | null)[] = [];
			if (fix.ratio !== undefined) {
				sets.push(`"ratio" = ?`);
				params.push(fix.ratio);
			}
			if ('requiredQuantity' in fix) {
				sets.push(`"requiredQuantity" = ?`);
				params.push(fix.requiredQuantity ?? null);
			}
			sets.push(`"updatedAt" = datetime('now')`);
			params.push(fix.name);
			await queryRunner.query(
				`UPDATE inventory_item SET ${sets.join(', ')} WHERE name = ?`,
				params,
			);
			const ch = await queryRunner.query(`SELECT changes() AS n`);
			ratioFixed += ch[0]?.n ?? 0;
		}
		console.log(`[InventoryEnhancementsBundle] ${ratioFixed} ratio(s) del catálogo corregidos`);

		// Re-recalcular retreat_inventory con los nuevos ratios.
		// SQLite no soporta alias en UPDATE — usar nombre de tabla directamente.
		await queryRunner.query(`
			UPDATE "retreat_inventory"
			SET "requiredQuantity" = (
				SELECT
					CASE
						WHEN ii."isCalculated" = 1 THEN "retreat_inventory"."requiredQuantity"
						WHEN ii."requiredQuantity" IS NOT NULL THEN ii."requiredQuantity"
						ELSE CAST(CEIL(ii."ratio" * COALESCE(
							(SELECT r."max_walkers" FROM "retreat" r WHERE r."id" = "retreat_inventory"."retreatId"),
							0
						)) AS INTEGER)
					END
				FROM "inventory_item" ii
				WHERE ii."id" = "retreat_inventory"."inventoryItemId"
			),
			"updatedAt" = datetime('now')
			WHERE "inventoryItemId" IS NOT NULL
		`);
		await queryRunner.query(`
			UPDATE "retreat_inventory"
			SET "isSufficient" = CASE
				WHEN COALESCE("requiredQuantity", 0) <= 0 THEN 1
				WHEN COALESCE("currentQuantity", 0) >= COALESCE("requiredQuantity", 0) THEN 1
				ELSE 0
			END,
			"updatedAt" = datetime('now')
		`);
		console.log(`[InventoryEnhancementsBundle] requiredQuantity recalculado con ratios corregidos`);

		// ════════════════════════════════════════════════════════════════
		// 10) Categoría "Camisetas" — asignar a filas de tipo shirt
		// ════════════════════════════════════════════════════════════════
		await queryRunner.query(`
			INSERT INTO inventory_category (id, name, description, isActive, createdAt, updatedAt)
			SELECT 'cat-12', 'Camisetas', 'Camisetas y chamarras del retiro', 1, datetime('now'), datetime('now')
			WHERE NOT EXISTS (SELECT 1 FROM inventory_category WHERE name = 'Camisetas')
		`);
		const catIdRow: { id: string }[] = await queryRunner.query(
			`SELECT id FROM inventory_category WHERE name = 'Camisetas' LIMIT 1`,
		);
		const camisetasCatId = catIdRow[0]?.id;
		if (camisetasCatId) {
			await queryRunner.query(
				`
				UPDATE retreat_inventory
				SET customCategoryId = ?, updatedAt = datetime('now')
				WHERE retreatShirtTypeId IS NOT NULL AND customCategoryId IS NULL
				`,
				[camisetasCatId],
			);
		}
		console.log('[InventoryEnhancementsBundle] categoría Camisetas creada y asignada');

		// ════════════════════════════════════════════════════════════════
		// 11) customTeamId — agregar columna y asignar Recepción a shirts
		// ════════════════════════════════════════════════════════════════
		try {
			await queryRunner.query(
				`ALTER TABLE retreat_inventory ADD COLUMN "customTeamId" varchar(36)`,
			);
		} catch {
			// columna ya existe
		}
		const recepTeamRow: { id: string }[] = await queryRunner.query(
			`SELECT id FROM inventory_team WHERE name = 'Recepción' LIMIT 1`,
		);
		const recepTeamId = recepTeamRow[0]?.id;
		if (recepTeamId) {
			await queryRunner.query(
				`UPDATE retreat_inventory SET customTeamId = ?, updatedAt = datetime('now')
				 WHERE retreatShirtTypeId IS NOT NULL AND customTeamId IS NULL`,
				[recepTeamId],
			);
		}
		console.log('[InventoryEnhancementsBundle] customTeamId agregado y asignado a shirts');

		// ════════════════════════════════════════════════════════════════
		// 12) Backfill participant_shirt_size desde campos legacy
		//     tshirtSize / needsWhiteShirt / needsBlueShirt / needsJacket
		// ════════════════════════════════════════════════════════════════
		type ShirtType2 = { id: string; retreatId: string; name: string; sortOrder: number };
		const allShirtTypes: ShirtType2[] = await queryRunner.query(
			`SELECT id, retreatId, name, sortOrder FROM retreat_shirt_type ORDER BY retreatId, sortOrder ASC`,
		);
		const byRetiro2 = new Map<string, ShirtType2[]>();
		for (const t of allShirtTypes) {
			const arr = byRetiro2.get(t.retreatId) ?? [];
			arr.push(t);
			byRetiro2.set(t.retreatId, arr);
		}
		let totalShirtSizes = 0;
		for (const [retreatId2, types2] of byRetiro2) {
			// No se salta aunque ya haya datos — INSERT OR IGNORE es idempotente
			// y rellena participantes que aún no tienen talla registrada en el
			// sistema nuevo (participant_shirt_size) pero sí en el campo legacy.

			const whiteFn = (t: ShirtType2) => /(blanca|blanco|white)/.test(t.name.toLowerCase());
			const blueFn = (t: ShirtType2) => /(azul|blue)/.test(t.name.toLowerCase());
			const jacketFn = (t: ShirtType2) => /(chamarra|jacket)/.test(t.name.toLowerCase());
			const whiteTypes2 = types2.filter(whiteFn);
			const blueType2 = types2.find(blueFn);
			const jacketType2 = types2.find(jacketFn);

			const uuidExpr = `lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))`;

			if (whiteTypes2.length > 0) {
				// Primer tipo blanca: walkers por tshirtSize + servidores por needsWhiteShirt
				await queryRunner.query(
					`INSERT OR IGNORE INTO participant_shirt_size (id, participantId, shirtTypeId, size)
					 SELECT ${uuidExpr}, rp.participantId, ?, p.tshirtSize
					 FROM retreat_participants rp INNER JOIN participants p ON p.id = rp.participantId
					 WHERE rp.retreatId = ? AND rp.isCancelled = 0
					   AND rp.type = 'walker' AND p.tshirtSize IS NOT NULL`,
					[whiteTypes2[0].id, retreatId2],
				);
				const ch1: { c: number }[] = await queryRunner.query(`SELECT changes() AS c`);
				totalShirtSizes += ch1[0]?.c ?? 0;
				// Servidores con needsWhiteShirt → primer tipo blanca (o segundo si hay dos)
				const whiteServerTypeId = whiteTypes2.length > 1 ? whiteTypes2[1].id : whiteTypes2[0].id;
				await queryRunner.query(
					`INSERT OR IGNORE INTO participant_shirt_size (id, participantId, shirtTypeId, size)
					 SELECT ${uuidExpr}, rp.participantId, ?, p.needsWhiteShirt
					 FROM retreat_participants rp INNER JOIN participants p ON p.id = rp.participantId
					 WHERE rp.retreatId = ? AND rp.isCancelled = 0 AND p.needsWhiteShirt IS NOT NULL`,
					[whiteServerTypeId, retreatId2],
				);
				const ch2: { c: number }[] = await queryRunner.query(`SELECT changes() AS c`);
				totalShirtSizes += ch2[0]?.c ?? 0;
			}
			if (blueType2) {
				await queryRunner.query(
					`INSERT OR IGNORE INTO participant_shirt_size (id, participantId, shirtTypeId, size)
					 SELECT ${uuidExpr}, rp.participantId, ?, p.needsBlueShirt
					 FROM retreat_participants rp INNER JOIN participants p ON p.id = rp.participantId
					 WHERE rp.retreatId = ? AND rp.isCancelled = 0 AND p.needsBlueShirt IS NOT NULL`,
					[blueType2.id, retreatId2],
				);
				const ch3: { c: number }[] = await queryRunner.query(`SELECT changes() AS c`);
				totalShirtSizes += ch3[0]?.c ?? 0;
			}
			if (jacketType2) {
				await queryRunner.query(
					`INSERT OR IGNORE INTO participant_shirt_size (id, participantId, shirtTypeId, size)
					 SELECT ${uuidExpr}, rp.participantId, ?, p.needsJacket
					 FROM retreat_participants rp INNER JOIN participants p ON p.id = rp.participantId
					 WHERE rp.retreatId = ? AND rp.isCancelled = 0 AND p.needsJacket IS NOT NULL`,
					[jacketType2.id, retreatId2],
				);
				const ch4: { c: number }[] = await queryRunner.query(`SELECT changes() AS c`);
				totalShirtSizes += ch4[0]?.c ?? 0;
			}
		}
		console.log(`[InventoryEnhancementsBundle] ${totalShirtSizes} shirt sizes backfilleados`);

		// ════════════════════════════════════════════════════════════════
		// 13) Calcular requiredQuantity de shirts desde participant_shirt_size
		// ════════════════════════════════════════════════════════════════
		await queryRunner.query(`
			UPDATE retreat_inventory
			SET requiredQuantity = (
				SELECT COUNT(*)
				FROM participant_shirt_size pss
				INNER JOIN retreat_participants rp
					ON rp.participantId = pss.participantId
					AND rp.retreatId = retreat_inventory.retreatId
					AND rp.isCancelled = 0
				WHERE pss.shirtTypeId = retreat_inventory.retreatShirtTypeId
					AND pss.size = retreat_inventory.shirtSize
			),
			updatedAt = datetime('now')
			WHERE retreatShirtTypeId IS NOT NULL
		`);
		const shirtUpdated: { c: number }[] = await queryRunner.query(`SELECT changes() AS c`);
		console.log(`[InventoryEnhancementsBundle] ${shirtUpdated[0]?.c ?? 0} filas de shirt recalculadas`);

		console.log('[InventoryEnhancementsBundle] done');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Migración consolidada — no soporta downgrade granular.
		// Para revertir: restaurar desde backup database.sqlite.bak-pre-inventory-bundle.
		console.warn(
			'[InventoryEnhancementsBundle] down() no implementado. Restaurar desde backup pre-migración.',
		);
	}
}
