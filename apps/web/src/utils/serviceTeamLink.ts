import { RESPONSIBILITY_TEAM_TYPE_MAP } from '@repo/types';
import type { ServiceTeam } from '@repo/types';

/**
 * Resuelve el equipo de servicio EXISTENTE relacionado con una responsabilidad,
 * usando el mapeo canónico responsable→tipo de equipo (`RESPONSIBILITY_TEAM_TYPE_MAP`).
 *
 * Devuelve `null` cuando:
 *  - el nombre de la responsabilidad no está en el mapeo (p. ej. charlas, textos,
 *    Inventario, Tesorero, …) → la vista NO muestra botón para agregar miembros, o
 *  - no existe todavía un equipo de ese tipo en el retiro.
 *
 * Nunca crea equipos: solo localiza el ya existente al cual agregarle miembros.
 */
export function findRelatedTeam(
	responsibilityName: string,
	teams: ServiceTeam[],
): ServiceTeam | null {
	const teamType = RESPONSIBILITY_TEAM_TYPE_MAP[responsibilityName];
	if (!teamType) return null;
	return teams.find((t) => t.teamType === teamType) ?? null;
}
