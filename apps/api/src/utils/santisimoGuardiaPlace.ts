// Lugar de la Guardia de la Capilla para los correos a angelitos.
// La guardia es en la capilla de la casa de retiro, no en la de la parroquia: con
// `retreat.parish` el asunto decía "Guardia de la Capilla — Buen Despacho" y se leía
// como la capilla de la parroquia (Del Valle II, 2026-10-16).

type RetreatLike = {
	parish?: string | null;
	house?: { name?: string | null } | null;
} | null | undefined;

/** Nombre de la casa de retiro; la parroquia solo si el retiro no tiene casa. */
export function guardiaPlaceLabel(retreat: RetreatLike): string {
	return retreat?.house?.name?.trim() || retreat?.parish?.trim() || 'el retiro';
}

/** " (retiro de X)" cuando el lugar es la casa, para ubicar a quien sirve en varios retiros. */
export function guardiaRetreatSuffix(retreat: RetreatLike): string {
	const hasHouse = !!retreat?.house?.name?.trim();
	const parish = retreat?.parish?.trim();
	return hasHouse && parish ? ` (retiro de ${parish})` : '';
}
