/**
 * #4 validaciones blandas del editor de pasos: los inputs numéricos aceptan
 * cualquier cosa al teclear (el min/max de type=number no enforcement el
 * valor escrito a mano). Antes de enviar al servidor, normalizamos cada paso:
 * hora a 0–23 y días a >= 0 ("antes del retiro" se expresa cambiando el
 * disparador, no con offsets negativos). Muta los pasos y devuelve cuántos
 * se ajustaron, para poder avisar al usuario.
 */
export function clampStepRanges<T extends { offsetDays: number; sendHour: number }>(
	steps: T[],
): number {
	let fixed = 0;
	for (const s of steps) {
		const hour = Math.min(23, Math.max(0, Math.round(Number(s.sendHour) || 0)));
		const days = Math.max(0, Math.round(Number(s.offsetDays) || 0));
		if (hour !== s.sendHour || days !== s.offsetDays) fixed += 1;
		s.sendHour = hour;
		s.offsetDays = days;
	}
	return fixed;
}
