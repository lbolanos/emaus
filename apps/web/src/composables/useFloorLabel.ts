/**
 * Devuelve la etiqueta de display para un piso, usando los labels configurables
 * de la casa cuando estén definidos. Fallback: "Piso N".
 *
 * Casas en México usan típicamente "Planta Baja" / "Planta Alta" en vez de
 * "Piso 1" / "Piso 2", por lo que cada casa puede definir sus propios nombres
 * en `house.floorLabels` (ej. { "1": "Planta Baja", "2": "Planta Alta" }).
 */
export function floorDisplay(
	floor: number | string | null | undefined,
	labels?: Record<string, string> | null,
): string {
	const key = floor === null || floor === undefined ? '1' : String(floor);
	const custom = labels?.[key];
	if (custom && custom.trim()) return custom;
	return `Piso ${key}`;
}

/**
 * Variante corta: devuelve la etiqueta sin prefijo "Piso" cuando sí hay label
 * configurado, útil para badges o títulos compactos.
 */
export function floorDisplayShort(
	floor: number | string | null | undefined,
	labels?: Record<string, string> | null,
): string {
	const key = floor === null || floor === undefined ? '1' : String(floor);
	const custom = labels?.[key];
	if (custom && custom.trim()) return custom;
	return key;
}
