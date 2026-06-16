import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Impone un techo absoluto de vida a la sesión, medido desde el login
 * (`session.loginAt`), independiente del rolling de inactividad.
 *
 * Sin esto, `rolling: true` renueva la expiración en cada request: una sesión
 * usada con regularidad nunca caduca, así que una cookie robada da acceso
 * indefinido. El techo absoluto acota esa ventana (default 90 días).
 *
 * Debe montarse DESPUÉS de `passport.session()` para ver `req.isAuthenticated()`.
 */
export function enforceAbsoluteSessionExpiry(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	// Solo aplica a sesiones autenticadas.
	if (!req.session || typeof req.isAuthenticated !== 'function' || !req.isAuthenticated()) {
		return next();
	}

	const absoluteMaxMs = config.session.absoluteMaxAgeDays * 24 * 60 * 60 * 1000;
	const loginAt = req.session.loginAt;

	// Sesiones creadas antes de este deploy no tienen `loginAt`: se sellan ahora
	// (no se expulsa a los usuarios ya logueados; el techo cuenta desde aquí).
	if (typeof loginAt !== 'number') {
		req.session.loginAt = Date.now();
		return next();
	}

	if (Date.now() - loginAt > absoluteMaxMs) {
		// Sesión vencida por techo absoluto: cerrar passport y destruir el registro.
		req.logout((logoutErr) => {
			if (logoutErr) return next(logoutErr);
			req.session.destroy(() => {
				res.clearCookie('emaus.sid');
				res.status(401).json({ message: 'Sesión expirada. Inicia sesión de nuevo.' });
			});
		});
		return;
	}

	next();
}
