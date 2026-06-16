import { AppDataSource } from '../data-source';
import { Session } from '../entities/session.entity';

/**
 * Revoca (borra) las sesiones persistidas de un usuario en la tabla `sessions`.
 *
 * Passport serializa `user.id` dentro del JSON de la sesión como
 * `"passport":{"user":"<id>"}` (ver authService.serializeUser). Buscamos ese
 * fragmento para borrar todas las sesiones del usuario.
 *
 * Se usa al cambiar/resetear la contraseña: sin esto, una sesión robada
 * sobrevive al cambio de contraseña hasta el techo absoluto (días). El usuario
 * que cambia su contraseña espera, con razón, que cualquier otra sesión muera.
 *
 * @param userId        id del usuario cuyas sesiones se revocan.
 * @param exceptSessionId  si se pasa, conserva esa sesión (la actual del propio
 *                         request: cambiar la contraseña no debería desloguear
 *                         al usuario que la está cambiando).
 * @returns número de sesiones borradas.
 */
export async function revokeUserSessions(
	userId: string,
	exceptSessionId?: string,
): Promise<number> {
	if (!userId) return 0;
	const repo = AppDataSource.getRepository(Session);
	const qb = repo
		.createQueryBuilder()
		.delete()
		.from(Session)
		.where('json LIKE :needle', { needle: `%"passport":{"user":"${userId}"}%` });
	if (exceptSessionId) {
		qb.andWhere('id != :exceptId', { exceptId: exceptSessionId });
	}
	const result = await qb.execute();
	return result.affected ?? 0;
}
