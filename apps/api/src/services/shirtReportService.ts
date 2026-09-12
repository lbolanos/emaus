import { AppDataSource } from '../data-source';
import { RetreatShirtType } from '../entities/retreatShirtType.entity';
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
	shirts: ShirtReportShirt[];
	shirtCharge: number;
};

export type ShirtReportShirtType = {
	id: string;
	name: string;
	color: string | null;
	sortOrder: number;
	price: number | null;
	/** Per-size overrides; a size's effective price is COALESCE(override, price, 0). */
	sizePrices: { size: string; price: number }[];
};

export type ShirtReportResponse = {
	shirtTypes: ShirtReportShirtType[];
	participants: ShirtReportParticipant[];
	totalCharge: number;
};

type Row = {
	participantId: string;
	firstName: string;
	lastName: string;
	idOnRetreat: number | null;
	type: 'server' | 'partial_server';
	shirtTypeId: string;
	shirtTypeName: string;
	color: string | null;
	sortOrder: number;
	size: string;
	// SQLite devuelve decimal como string en queries crudos.
	price: string | number | null;
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
	}));

	// Single query: join participants + retreat_participants + participant_shirt_size + retreat_shirt_type
	// scoping shirt-types to this retreat so cross-retreat sizes are excluded.
	// The LEFT JOIN coalesces the per-size override over the type's base price,
	// so each row's `price` is already EFFECTIVE.
	const rows: Row[] = await AppDataSource.query(
		`SELECT
       p.id              AS participantId,
       p.firstName       AS firstName,
       p.lastName        AS lastName,
       rp.idOnRetreat    AS idOnRetreat,
       rp.type           AS type,
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
     INNER JOIN participant_shirt_size pss
       ON pss.participantId = p.id
       AND pss.size IS NOT NULL
       AND pss.size != ''
       AND pss.size != 'null'
     INNER JOIN retreat_shirt_type rst
       ON rst.id = pss.shirtTypeId
       AND rst.retreatId = ?
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
			};
			byParticipant.set(r.participantId, entry);
		}
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

	return {
		shirtTypes,
		participants,
		totalCharge,
	};
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
