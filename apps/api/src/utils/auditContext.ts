import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto por-request para auditoría.
 *
 * Permite que `domainAuditService` sepa QUIÉN hizo un cambio (userId, ip, userAgent)
 * sin tener que propagar esos datos por las firmas de todos los servicios de dominio.
 * Un middleware (`requestContextMiddleware`) puebla el store al inicio de cada request
 * y cualquier código downstream (controllers, services, repos) lo lee con `auditContext.get()`.
 *
 * Fuera de un request (seed, jobs, cron, tests directos) `getStore()` devuelve `undefined`;
 * todos los getters toleran ese caso devolviendo `null`.
 */
export interface AuditContext {
	userId?: string | null;
	ip?: string | null;
	userAgent?: string | null;
}

const als = new AsyncLocalStorage<AuditContext>();

export const auditContext = {
	/**
	 * Ejecuta `fn` con `ctx` disponible para todo el árbol async downstream.
	 * El `next()` de Express DEBE invocarse dentro de este callback para que el
	 * contexto se propague al resto del pipeline.
	 */
	run<T>(ctx: AuditContext, fn: () => T): T {
		return als.run(ctx, fn);
	},

	/** Devuelve el contexto actual o `undefined` si estamos fuera de un request. */
	get(): AuditContext | undefined {
		return als.getStore();
	},

	getUserId(): string | null {
		return als.getStore()?.userId ?? null;
	},

	getIp(): string | null {
		return als.getStore()?.ip ?? null;
	},

	getUserAgent(): string | null {
		return als.getStore()?.userAgent ?? null;
	},
};
