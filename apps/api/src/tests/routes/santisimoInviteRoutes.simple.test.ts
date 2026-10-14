/**
 * Source-level test del wiring de las rutas públicas del enlace personal de
 * guardias del Santísimo (specs/santisimo-guardia-links).
 *
 * Verifica, escaneando el source (patrón de santisimoRoutes.regenerate):
 *  - las tres rutas `/public/invite/...` están registradas ANTES de
 *    `router.use(isAuthenticated)` (si quedan después, el servidor las exige
 *    con sesión y el enlace muere con 401);
 *  - el POST aplica rate limit + validateRequest con el schema del invite;
 *  - la exención CSRF cubre el prefijo `/santisimo/public` (comparación
 *    startsWith en routeCsrf), así que las rutas nuevas quedan exentas.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROUTE_FILE = join(__dirname, '..', '..', 'routes', 'santisimoRoutes.ts');
const ROUTES_INDEX_FILE = join(__dirname, '..', '..', 'routes', 'index.ts');
const CSRF_FILE = join(__dirname, '..', '..', 'middleware', 'routeCsrf.ts');
const FRONTEND_API_FILE = join(
	__dirname,
	'..',
	'..',
	'..',
	'..',
	'web',
	'src',
	'services',
	'api.ts',
);

const routeSrc = readFileSync(ROUTE_FILE, 'utf-8');
const code = routeSrc
	.split('\n')
	.filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
	.join('\n');

describe('santisimoRoutes — rutas públicas del invite /public/invite/:token', () => {
	it('expone GET /public/invite/:token antes del guard de sesión', () => {
		expect(code).toMatch(/router\.get\(\s*['"]\/public\/invite\/:token['"]/);
		const routePos = code.search(/router\.get\(\s*['"]\/public\/invite\/:token['"]/);
		const authPos = code.search(/router\.use\(isAuthenticated\)/);
		expect(authPos).toBeGreaterThan(-1);
		expect(routePos).toBeGreaterThan(-1);
		expect(routePos).toBeLessThan(authPos);
	});

	it('expone POST /public/invite/:token/signup antes del guard de sesión', () => {
		const block = code.match(
			/router\.post\(\s*['"]\/public\/invite\/:token\/signup['"][^)]*\)/,
		);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/publicParticipantLimiter/);
		expect(block![0]).toMatch(/validateRequest\(\s*PublicSantisimoInviteSignupSchema\s*\)/);

		const authPos = code.search(/router\.use\(isAuthenticated\)/);
		expect(code.search(/router\.post\(\s*['"]\/public\/invite\/:token\/signup['"]/)).toBeLessThan(authPos);
	});

	it('expone DELETE /public/invite/:token/signup antes del guard de sesión, con rate limit', () => {
		const block = code.match(
			/router\.delete\(\s*['"]\/public\/invite\/:token\/signup['"][^)]*\)/,
		);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/publicParticipantLimiter/);

		const authPos = code.search(/router\.use\(isAuthenticated\)/);
		expect(
			code.search(/router\.delete\(\s*['"]\/public\/invite\/:token\/signup['"]/),
		).toBeLessThan(authPos);
	});

	it('la exención CSRF cubre el prefijo /santisimo/public (comparación startsWith)', () => {
		const indexSrc = readFileSync(ROUTES_INDEX_FILE, 'utf-8');
		expect(indexSrc).toMatch(/['"]\/santisimo\/public['"]/);

		const csrfSrc = readFileSync(CSRF_FILE, 'utf-8');
		expect(csrfSrc).toMatch(/startsWith/);
	});

	it('GET /retreats/:retreatId/guardia-links es autenticado con santisimo:read', () => {
		const block = code.match(/router\.get\(\s*['"]\/retreats\/:retreatId\/guardia-links['"][^)]*\)/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/requirePermission\(\s*['"]santisimo:read['"]\s*\)/);

		// Debe quedar DESPUÉS del guard de sesión (requiere auth).
		const authPos = code.search(/router\.use\(isAuthenticated\)/);
		expect(
			code.search(/router\.get\(\s*['"]\/retreats\/:retreatId\/guardia-links['"]/),
		).toBeGreaterThan(authPos);

		// El cliente apunta exactamente a esa URL (un mismatch = 404 en prod).
		const apiSrc = readFileSync(FRONTEND_API_FILE, 'utf-8');
		expect(apiSrc).toMatch(/\/santisimo\/retreats\/\$\{retreatId\}\/guardia-links/);
	});
});
