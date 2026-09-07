/**
 * Cumpleaños que caen dentro de las fechas de un retiro.
 *
 * La lógica estaba duplicada —el resaltado de la fila en ParticipantList y el
 * aviso de WalkersView— y las dos copias no coincidían: la del aviso pasaba el
 * `birthDate` por `toISOString()`, que corre el día cuando el string trae hora
 * sin sufijo `Z`. Aquí queda una sola versión, que lee el `YYYY-MM-DD` tal cual
 * viene y compara día y mes sin construir instantes UTC.
 */

export interface CalendarDate {
	year: number;
	/** 1-indexed, como se lee en el string. */
	month: number;
	day: number;
}

export interface RetreatBirthday<T> {
	participant: T;
	/** Día del retiro en que cae el cumpleaños, como fecha local. */
	date: Date;
	/** Años que cumple ese día. */
	turningAge: number;
}

interface HasBirthDate {
	birthDate?: string | Date | null;
}

/**
 * Extrae los componentes de calendario de una fecha date-only.
 *
 * De un string toma los dígitos del `YYYY-MM-DD` inicial e ignora el resto: no
 * hay conversión de zona, así que la fecha que se ve en el dato es la que se
 * usa. De un `Date` lee los componentes UTC, que es como se guardan las
 * columnas date-only (medianoche UTC).
 */
export function parseCalendarDate(value?: string | Date | null): CalendarDate | null {
	if (!value) return null;

	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return null;
		return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
	}

	const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!match) return null;
	return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * Día del retiro en que la persona cumple años, o `null` si no cae dentro.
 *
 * Recorre día a día el rango del retiro (son tres o cuatro) comparando día y
 * mes, así que cruzar el fin de mes o el fin de año no necesita caso aparte.
 */
export function getBirthdayCelebration(
	birthDate?: string | Date | null,
	retreatStart?: string | Date | null,
	retreatEnd?: string | Date | null,
): { date: Date; turningAge: number } | null {
	const birth = parseCalendarDate(birthDate);
	const start = parseCalendarDate(retreatStart);
	const end = parseCalendarDate(retreatEnd);
	if (!birth || !start || !end) return null;

	const cursor = new Date(start.year, start.month - 1, start.day);
	const last = new Date(end.year, end.month - 1, end.day);

	while (cursor <= last) {
		if (cursor.getMonth() + 1 === birth.month && cursor.getDate() === birth.day) {
			return { date: new Date(cursor), turningAge: cursor.getFullYear() - birth.year };
		}
		cursor.setDate(cursor.getDate() + 1);
	}

	return null;
}

/** ¿El cumpleaños cae durante el retiro? */
export function hasBirthdayDuringRetreat(
	birthDate?: string | Date | null,
	retreatStart?: string | Date | null,
	retreatEnd?: string | Date | null,
): boolean {
	return getBirthdayCelebration(birthDate, retreatStart, retreatEnd) !== null;
}

/** Los que cumplen años durante el retiro, ordenados por el día en que caen. */
export function getBirthdaysDuringRetreat<T extends HasBirthDate>(
	participants: T[],
	retreatStart?: string | Date | null,
	retreatEnd?: string | Date | null,
): RetreatBirthday<T>[] {
	return participants
		.map((participant) => {
			const celebration = getBirthdayCelebration(participant.birthDate, retreatStart, retreatEnd);
			return celebration ? { participant, ...celebration } : null;
		})
		.filter((entry): entry is RetreatBirthday<T> => entry !== null)
		.sort((a, b) => a.date.getTime() - b.date.getTime());
}
