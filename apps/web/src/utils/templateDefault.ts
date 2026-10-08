/**
 * M6: how a template of a type is picked when nothing pins one — the type's
 * "predeterminada" first, else the oldest. Mirrors the server's
 * `DEFAULT_TEMPLATE_ORDER` (apps/api/src/services/messageTemplateService.ts),
 * so the UI names the same template the engine and quick-send buttons use.
 */
type Pickable = { isDefault?: boolean | null; createdAt?: string | Date | null };

// Un createdAt presente pero invalidable (serialización mala) daría NaN y un
// comparador inconsistente (orden no determinista entre renders); lo mandamos
// al final igual que los ausentes.
const time = (t: Pickable) => {
	const ms = t.createdAt ? new Date(t.createdAt).getTime() : Number.POSITIVE_INFINITY;
	return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
};

export function byDefaultFirst(a: Pickable, b: Pickable): number {
	return Number(!!b.isDefault) - Number(!!a.isDefault) || time(a) - time(b);
}

/** The template that acts as default among `list` (same type), if any. */
export function effectiveDefaultTemplate<T extends Pickable>(list: readonly T[]): T | undefined {
	return [...list].sort(byDefaultFirst)[0];
}
