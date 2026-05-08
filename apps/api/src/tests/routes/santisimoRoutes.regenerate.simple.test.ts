/**
 * Source-level test que verifica que el endpoint
 * `POST /retreats/:retreatId/slots/regenerate-from-schedule` está registrado
 * en `santisimoRoutes.ts` con el controller y los middlewares correctos.
 *
 * El frontend (`apps/web/src/services/api.ts > santisimoApi.regenerateFromSchedule`)
 * invoca exactamente esa URL — un mismatch causaría 404 en producción aunque
 * el controller esté implementado. Este test escanea el source para cazar
 * la regresión sin tener que bootear Express + supertest.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROUTE_FILE = join(
	__dirname,
	'..',
	'..',
	'routes',
	'santisimoRoutes.ts',
);
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

describe('santisimoRoutes — POST /retreats/:retreatId/slots/regenerate-from-schedule', () => {
	it('expone POST /retreats/:retreatId/slots/regenerate-from-schedule', () => {
		expect(code).toMatch(
			/router\.post\(\s*['"]\/retreats\/:retreatId\/slots\/regenerate-from-schedule['"]/,
		);
	});

	it('aplica requirePermission("santisimo:manage")', () => {
		// Encuentra el bloque del POST regenerate-from-schedule y verifica que
		// dentro del array de handlers aparezca requirePermission('santisimo:manage').
		const blockMatch = code.match(
			/router\.post\(\s*['"]\/retreats\/:retreatId\/slots\/regenerate-from-schedule['"][^)]*\)/,
		);
		expect(blockMatch).not.toBeNull();
		expect(blockMatch![0]).toMatch(/requirePermission\(\s*['"]santisimo:manage['"]\s*\)/);
	});

	it('importa el controller `regenerateFromSchedule`', () => {
		expect(routeSrc).toMatch(/regenerateFromSchedule/);
	});

	it('el frontend api.ts apunta exactamente a esa URL', () => {
		const apiSrc = readFileSync(FRONTEND_API_FILE, 'utf-8');
		expect(apiSrc).toMatch(
			/\/santisimo\/retreats\/\$\{retreatId\}\/slots\/regenerate-from-schedule/,
		);
	});
});
