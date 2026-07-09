/**
 * Etiqueta de ubicación de una casa para el desplegable de selección de casa
 * (p. ej. en el formulario del retiro).
 *
 * Mostramos la DIRECCIÓN (`address1`), no la ciudad: la mayoría de las casas
 * están en la misma ciudad ("Ciudad de México"), así que la ciudad no ayuda a
 * distinguirlas; la calle sí. Limpiamos comas/espacios sobrantes (ej. address1
 * = ", EL PEDREGAL" cuando la calle quedó vacía). Si no hay dirección capturada,
 * caemos a "ciudad, estado" para no dejar la línea vacía.
 */
export interface HouseLike {
  address1?: string | null;
  city?: string | null;
  state?: string | null;
}

export function houseLocationLabel(house: HouseLike | null | undefined): string {
  const address = String(house?.address1 ?? '')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
  if (address) return address;
  const city = String(house?.city ?? '').trim();
  const state = String(house?.state ?? '').trim();
  return [city, state].filter(Boolean).join(', ');
}
