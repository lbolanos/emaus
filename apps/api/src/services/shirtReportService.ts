import { AppDataSource } from '../data-source';
import { RetreatShirtType } from '../entities/retreatShirtType.entity';
import { Retreat } from '../entities/retreat.entity';
import { formatCurrency } from '@repo/utils';

export type ShirtReportShirt = {
	shirtTypeId: string;
	shirtTypeName: string;
	color: string | null;
	sortOrder: number;
	size: string;
	price: number | null;
};

export type ShirtReportParticipant = {
	participantId: string;
	firstName: string;
	lastName: string;
	idOnRetreat: number | null;
	type: 'server' | 'partial_server';
	/** Empty when the server did not order any garment — they still get confirmed. */
	shirts: ShirtReportShirt[];
	shirtCharge: number;
	// Confirmación del pedido (chulo del coordinador, flujo SERVER_SHIRT_CONFIRMATION)
	// y contacto para el botón de WhatsApp del reporte. La query es cruda: SQLite
	// devuelve datetime como string ('2026-09-21 12:00:00.000'), no Date.
	shirtOrderConfirmedAt: string | null;
	cellPhone: string | null;
	country: string | null;
};

export type ShirtReportShirtType = {
	id: string;
	name: string;
	color: string | null;
	sortOrder: number;
	price: number | null;
	/** Per-size overrides; a size's effective price is COALESCE(override, price, 0). */
	sizePrices: { size: string; price: number }[];
	/** Sizes the type offers; the walker estimate dialog renders one input each. */
	availableSizes: string[] | null;
	/** The garment walkers pick at registration (falls back to the first type). */
	requiredForWalkers: boolean;
};

/** Walkers' shirt sizes — counts only, no PII. A walker wears a single garment. */
export type ShirtReportWalkerShirt = {
	size: string;
	count: number;
};

export type ShirtOrderEstimate = {
	expectedWalkers?: number | null;
	/** Walker garment pieces to add, by size: { size: pieces }. */
	estimatedShirts?: Record<string, number>;
};

export type ShirtReportResponse = {
	shirtTypes: ShirtReportShirtType[];
	participants: ShirtReportParticipant[];
	totalCharge: number;
	/** Non-cancelled walkers of the retreat (registered so far). */
	walkerCount: number;
	walkerShirts: ShirtReportWalkerShirt[];
	estimate: ShirtOrderEstimate | null;
};

type Row = {
	participantId: string;
	firstName: string;
	lastName: string;
	idOnRetreat: number | null;
	type: 'server' | 'partial_server';
	// Garment columns come from LEFT JOINs: all null when the server did not
	// order anything (they still get a row so they can be confirmed too).
	shirtTypeId: string | null;
	shirtTypeName: string | null;
	color: string | null;
	sortOrder: number | null;
	size: string | null;
	// SQLite devuelve decimal como string en queries crudos.
	price: string | number | null;
	// ...y datetime también: llega como string, no Date.
	shirtOrderConfirmedAt: string | null;
	cellPhone: string | null;
	country: string | null;
};

export const getShirtOrdersForRetreat = async (
	retreatId: string,
): Promise<ShirtReportResponse> => {
	const shirtTypeRepo = AppDataSource.getRepository(RetreatShirtType);
	const types = await shirtTypeRepo.find({
		where: { retreatId },
		order: { sortOrder: 'ASC', createdAt: 'ASC' },
		relations: ['sizePrices'],
	});

	const shirtTypes: ShirtReportShirtType[] = types.map((t) => ({
		id: t.id,
		name: t.name,
		color: t.color ?? null,
		sortOrder: t.sortOrder,
		price: t.price != null ? Number(t.price) : null,
		sizePrices: (t.sizePrices ?? []).map((sp) => ({
			size: sp.size,
			price: Number(sp.price),
		})),
		availableSizes: t.availableSizes ?? null,
		requiredForWalkers: !!t.requiredForWalkers,
	}));

	// Single query: join participants + retreat_participants + participant_shirt_size + retreat_shirt_type
	// scoping shirt-types to this retreat so cross-retreat sizes are excluded.
	// Universe = EVERY non-cancelled server/partial_server of the retreat: the
	// SERVER_SHIRT_CONFIRMATION sequence enrolls them all (some answer "no
	// necesito camisetas" and earn their checkmark too), so the garment side is
	// a LEFT JOIN — whoever ordered nothing still gets one row with null garment
	// columns and aggregates to shirts: []. The retreat scoping lives INSIDE
	// the derived table (INNER): a bare LEFT JOIN chain would let cross-retreat
	// rows through with null rst columns (phantom garments), and moving the
	// scoping to WHERE would drop the no-garment rows again.
	// The LEFT JOIN coalesces the per-size override over the type's base price,
	// so each row's `price` is already EFFECTIVE.
	const rows: Row[] = await AppDataSource.query(
		`SELECT
       p.id              AS participantId,
       p.firstName       AS firstName,
       p.lastName        AS lastName,
       rp.idOnRetreat    AS idOnRetreat,
       rp.type           AS type,
       rp.shirtOrderConfirmedAt AS shirtOrderConfirmedAt,
       p.cellPhone       AS cellPhone,
       p.country         AS country,
       pss.shirtTypeId   AS shirtTypeId,
       rst.name          AS shirtTypeName,
       rst.color         AS color,
       rst.sortOrder     AS sortOrder,
       pss.size          AS size,
       COALESCE(ssp.price, rst.price) AS price
     FROM participants p
     INNER JOIN retreat_participants rp
       ON rp.participantId = p.id
       AND rp.retreatId = ?
       AND rp.isCancelled = 0
       AND rp.type IN ('server', 'partial_server')
     LEFT JOIN (
       SELECT pss2.participantId AS participantId,
              pss2.shirtTypeId  AS shirtTypeId,
              pss2.size         AS size
       FROM participant_shirt_size pss2
       INNER JOIN retreat_shirt_type rst2
         ON rst2.id = pss2.shirtTypeId
         AND rst2.retreatId = ?
       WHERE pss2.size IS NOT NULL
         AND pss2.size != ''
         AND pss2.size != 'null'
     ) pss ON pss.participantId = p.id
     LEFT JOIN retreat_shirt_type rst
       ON rst.id = pss.shirtTypeId
     LEFT JOIN retreat_shirt_type_size_price ssp
       ON ssp.shirtTypeId = rst.id
       AND ssp.size = pss.size
     ORDER BY p.lastName ASC, p.firstName ASC, rst.sortOrder ASC`,
		[retreatId, retreatId],
	);

	const byParticipant = new Map<string, ShirtReportParticipant>();
	for (const r of rows) {
		let entry = byParticipant.get(r.participantId);
		if (!entry) {
			entry = {
				participantId: r.participantId,
				firstName: r.firstName,
				lastName: r.lastName,
				idOnRetreat: r.idOnRetreat,
				type: r.type,
				shirts: [],
				shirtCharge: 0,
				shirtOrderConfirmedAt: r.shirtOrderConfirmedAt ?? null,
				cellPhone: r.cellPhone ?? null,
				country: r.country ?? null,
			};
			byParticipant.set(r.participantId, entry);
		}
		// No-garment row (LEFT JOIN without match): the participant stays
		// listed with shirts: [] — the "no necesito camisetas" answer gets its
		// checkmark like anyone else's (SERVER_SHIRT_CONFIRMATION flow).
		if (r.shirtTypeId == null) continue;
		const price = r.price != null && r.price !== '' ? Number(r.price) : null;
		entry.shirts.push({
			shirtTypeId: r.shirtTypeId,
			shirtTypeName: r.shirtTypeName,
			color: r.color,
			sortOrder: r.sortOrder,
			size: r.size,
			price,
		});
		entry.shirtCharge = Math.round((entry.shirtCharge + (price || 0)) * 100) / 100;
	}

	const participants = Array.from(byParticipant.values());
	const totalCharge = Math.round(participants.reduce((sum, p) => sum + p.shirtCharge, 0) * 100) / 100;

	// Walkers feed only the purchase summary: their garment is included in the
	// retreat fee (never charged), so they are counted by size instead of
	// listed. One size per walker: their participant_shirt_size row for a type
	// of THIS retreat (the walker type first), else the legacy
	// participants.tshirtSize — walkers imported from Excel only have the
	// legacy column (the bags report reads it too), and skipping it left the
	// whole walker side of the order empty.
	const walkerRows: { size: string; count: number | string }[] = await AppDataSource.query(
		`SELECT walkerSize AS size, COUNT(*) AS count
		 FROM (
		   SELECT COALESCE(
		     (SELECT pss.size
		      FROM participant_shirt_size pss
		      INNER JOIN retreat_shirt_type rst
		        ON rst.id = pss.shirtTypeId
		        AND rst.retreatId = ?
		      WHERE pss.participantId = rp.participantId
		        AND pss.size IS NOT NULL
		        AND pss.size != ''
		        AND pss.size != 'null'
		      ORDER BY rst.requiredForWalkers DESC, rst.sortOrder ASC
		      LIMIT 1),
		     CASE
		       WHEN p.tshirtSize IS NOT NULL AND p.tshirtSize != '' AND p.tshirtSize != 'null'
		       THEN p.tshirtSize
		     END
		   ) AS walkerSize
		   FROM retreat_participants rp
		   INNER JOIN participants p ON p.id = rp.participantId
		   WHERE rp.retreatId = ?
		     AND rp.type = 'walker'
		     AND rp.isCancelled = 0
		 ) w
		 WHERE walkerSize IS NOT NULL
		 GROUP BY walkerSize`,
		[retreatId, retreatId],
	);
	const walkerShirts: ShirtReportWalkerShirt[] = walkerRows.map((r) => ({
		size: r.size,
		count: Number(r.count),
	}));

	const walkerCountRows: { count: number | string }[] = await AppDataSource.query(
		`SELECT COUNT(*) AS count FROM retreat_participants
		 WHERE retreatId = ? AND type = 'walker' AND isCancelled = 0`,
		[retreatId],
	);
	const walkerCount = Number(walkerCountRows[0]?.count ?? 0);

	const retreat = await AppDataSource.getRepository(Retreat).findOne({
		where: { id: retreatId },
		select: { id: true, shirtOrderEstimate: true },
	});

	return {
		shirtTypes,
		participants,
		totalCharge,
		walkerCount,
		walkerShirts,
		estimate: retreat?.shirtOrderEstimate ?? null,
	};
};

/**
 * Saves (or clears, with null) the walker estimate of a retreat. Returns false
 * when the retreat does not exist.
 */
export const setShirtOrderEstimate = async (
	retreatId: string,
	estimate: ShirtOrderEstimate | null,
): Promise<boolean> => {
	const repo = AppDataSource.getRepository(Retreat);
	const retreat = await repo.findOne({ where: { id: retreatId }, select: { id: true } });
	if (!retreat) return false;
	await repo.update({ id: retreatId }, { shirtOrderEstimate: estimate });
	return true;
};

export type ParticipantShirtOrderSummary = {
	shirtOrderSummary: string;
	shirtCharge: number;
};

/**
 * Resumen del pedido de prendas de un participante en un retiro, para las
 * variables de plantilla `{participant.shirtOrderSummary}` y
 * `{participant.shirtCharge}` (confirmación de camisetas a servidores). Una
 * línea por prenda con talla y precio (sin sufijo de precio si es 0/null);
 * texto de fallback cuando el participante no configuró tallas.
 *
 * Vive aquí (no en `messageSequenceService` ni `participantService`) para que
 * ambos — el motor de secuencias automáticas y el endpoint que alimenta el
 * envío manual (`GET /participants/:id/shirt-order`) — compartan una sola
 * implementación sin crear un import circular entre esos dos servicios.
 *
 * El VALOR (`shirtCharge`) solo aplica a servidores/angelitos, igual que
 * `Participant.computeCharges()`: un caminante puede tener filas en
 * `participant_shirt_size` (prenda `requiredForWalkers`), pero su prenda va
 * incluida en la cuota del retiro — mostrarle un cargo aquí sería engañoso
 * (el saldo real nunca se lo cobra). `participantType` es un atajo opcional
 * para un caller que ya tenga el tipo hidratado (evita la query extra); si no
 * viene, se resuelve acá con una consulta a `retreat_participants`. Ninguno de
 * los llamadores actuales (`messageSequenceService`, el controller HTTP) tiene
 * el tipo a mano en ese punto — `participant.type` es un campo virtual que
 * solo se hidrata cuando alguien hace overlay explícito desde
 * `retreat_participants` (`findAllParticipants`/`findParticipantById`), así
 * que hoy siempre cae a la query interna. El parámetro queda para el caller
 * que sí lo tenga.
 */
export const getParticipantShirtOrderSummary = async (
	participantId: string,
	retreatId: string,
	participantType?: string | null,
): Promise<ParticipantShirtOrderSummary> => {
	let type = participantType;
	if (type === undefined) {
		const rp: { type: string | null }[] = await AppDataSource.query(
			`SELECT type FROM retreat_participants WHERE participantId = ? AND retreatId = ? LIMIT 1`,
			[participantId, retreatId],
		);
		type = rp[0]?.type ?? null;
	}
	const chargeable = type === 'server' || type === 'partial_server';

	// Per-size override coalesced over the base price: `price` comes out EFFECTIVE.
	const rows: { name: string; size: string; price: string | number | null }[] =
		await AppDataSource.query(
			`SELECT rst.name, pss.size, COALESCE(ssp.price, rst.price) AS price
			 FROM participant_shirt_size pss
			 INNER JOIN retreat_shirt_type rst ON rst.id = pss.shirtTypeId
			 LEFT JOIN retreat_shirt_type_size_price ssp
			   ON ssp.shirtTypeId = rst.id AND ssp.size = pss.size
			 WHERE pss.participantId = ? AND rst.retreatId = ?
			 ORDER BY rst.sortOrder IS NULL, rst.sortOrder, rst.name`,
			[participantId, retreatId],
		);
	if (rows.length === 0) {
		return {
			shirtOrderSummary: 'Aún no has configurado tus tallas',
			shirtCharge: 0,
		};
	}
	let total = 0;
	const lines = rows.map((r) => {
		const price = r.price != null && r.price !== '' ? Number(r.price) : 0;
		if (chargeable) total += price;
		const priceSuffix = chargeable && price > 0 ? ` — ${formatCurrency(price)}` : '';
		return `• ${r.name} (talla ${r.size})${priceSuffix}`;
	});
	return {
		shirtOrderSummary: lines.join('\n'),
		shirtCharge: chargeable ? Math.round(total * 100) / 100 : 0,
	};
};
