import 'express-session';

declare module 'express-session' {
	interface SessionData {
		csrfToken?: string;
		// Epoch ms del login. Sella la sesión para imponer un techo absoluto de
		// vida (independiente del rolling de inactividad).
		loginAt?: number;
	}
}
