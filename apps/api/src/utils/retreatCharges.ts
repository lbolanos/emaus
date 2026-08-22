/**
 * Helpers de cobros del retiro (paz y salvo v2).
 *
 * El cobro del CAMINANTE es el texto `retreat.cost` (ej. "$2,800") parseado a número.
 * El cobro del SERVIDOR es `retreat.serverFeeAmount` (numérico); si es null, cae a `cost`.
 * El ANGELITO (partial_server) no tiene cobro de retiro (solo comidas).
 *
 * Consolida el parseo que antes estaba duplicado en `participant.entity.ts` y
 * `participantService.ts`.
 */

export interface RetreatFeeSource {
	cost?: string | null;
	serverFeeAmount?: number | null;
	retreat_type?: string | null;
}

/**
 * Parsea el costo del retiro (texto libre, posible formato de moneda) a número.
 * Devuelve 0 si está vacío o no contiene dígitos válidos.
 */
export function parseRetreatCost(cost?: string | null): number {
	if (cost == null) return 0;
	const costString = String(cost).replace(/[^0-9.-]/g, '');
	return parseFloat(costString) || 0;
}

/**
 * Cobro del retiro aplicable según el tipo de participante (sin comidas ni deudas).
 *
 * Retiros de parejas (retreat_type='couples'): `cost` y `serverFeeAmount` son el
 * monto POR PAREJA (decisión de la organización), así que cada cónyuge carga la
 * mitad en su ledger individual de pagos. Un pago registrado contra un cónyuge
 * abona solo a su mitad.
 */
export function retreatFeeForType(
	type: string | null | undefined,
	retreat: RetreatFeeSource,
): number {
	const parsedCost = parseRetreatCost(retreat.cost);
	const perPersonFactor = retreat.retreat_type === 'couples' ? 0.5 : 1;
	switch (type) {
		case 'partial_server': // angelito: sin cobro de retiro
			return 0;
		case 'server': {
			const fee =
				retreat.serverFeeAmount != null ? Number(retreat.serverFeeAmount) || 0 : parsedCost;
			return fee * perPersonFactor;
		}
		default: // walker, waiting, o tipo no overlaid → cobro del caminante = `cost`
			return parsedCost * perPersonFactor;
	}
}
