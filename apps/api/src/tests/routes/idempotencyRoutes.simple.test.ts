/**
 * Static guard (specs/offline-mode, FR-16): the writes the web app can queue
 * without signal must carry the idempotency middleware, AFTER the auth and
 * permission checks and right before the controller. If someone drops it from a
 * route nothing fails — until a resend at the retreat house records a payment
 * twice or moves the schedule by 10 minutes instead of 5.
 *
 * Source-level, like the other route guards in this folder: no Express boot.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROUTES_DIR = join(__dirname, '..', '..', 'routes');

const code = (file: string) =>
	readFileSync(join(ROUTES_DIR, file), 'utf-8')
		.split('\n')
		.filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
		.join('\n');

/** The full `router.<method>(...)` call that declares `path`. */
function routeCall(src: string, method: string, path: string): string {
	const start = src.search(new RegExp(`router\\.${method}\\(\\s*['"]${path.replace(/[/:]/g, (c) => `\\${c}`)}['"]`));
	if (start === -1) return '';
	return src.slice(start, src.indexOf(');', start) + 2);
}

const QUEUEABLE: Array<{ file: string; method: string; path: string; handler: string }> = [
	{ file: 'participantRoutes.ts', method: 'put', path: '/:id/checkin', handler: 'checkInParticipant' },
	{ file: 'participantRoutes.ts', method: 'put', path: '/:id', handler: 'updateParticipant' },
	{ file: 'paymentRoutes.ts', method: 'post', path: '/', handler: 'paymentController.createPayment' },
	{
		file: 'retreatParticipant.routes.ts',
		method: 'patch',
		path: '/history/retreat/:retreatId/participant/:participantId/bag-made',
		handler: 'updateBagMadeController',
	},
	{ file: 'retreatScheduleRoutes.ts', method: 'post', path: '/items/:id/start', handler: 'startItem' },
	{ file: 'retreatScheduleRoutes.ts', method: 'post', path: '/items/:id/complete', handler: 'completeItem' },
	{ file: 'retreatScheduleRoutes.ts', method: 'post', path: '/items/:id/shift', handler: 'shiftItem' },
	{
		file: 'retreatScheduleRoutes.ts',
		method: 'post',
		path: '/retreats/:retreatId/days/:day/shift',
		handler: 'shiftDay',
	},
	{ file: 'retreatBedRoutes.ts', method: 'put', path: '/retreat-beds/:bedId/assign', handler: 'assignParticipantToBed' },
	{ file: 'tableMesaRoutes.ts', method: 'post', path: '/:id/walkers', handler: 'tableMesaController.assignWalker' },
	{
		file: 'tableMesaRoutes.ts',
		method: 'delete',
		path: '/:id/walkers/:walkerId',
		handler: 'tableMesaController.unassignWalker',
	},
];

describe('queueable writes carry the idempotency middleware', () => {
	test('the list covers the 11 operations of spec D2', () => {
		expect(QUEUEABLE).toHaveLength(11);
	});

	test.each(QUEUEABLE)('$method $path ($file)', ({ file, method, path, handler }) => {
		const call = routeCall(code(file), method, path);
		expect(call).not.toBe('');

		const idem = call.indexOf('idempotency,');
		const permission = call.indexOf('requirePermission(');
		// lastIndexOf: `updateParticipant` also appears inside `updateParticipantSchema`.
		const controller = call.lastIndexOf(handler);
		expect(idem).toBeGreaterThan(-1);
		// Runs after the permission check (an unauthorized caller never claims a key)…
		expect(idem).toBeGreaterThan(permission);
		// …and right before the controller.
		expect(controller).toBeGreaterThan(idem);
	});

	test.each(QUEUEABLE.map((r) => r.file).filter((f, i, all) => all.indexOf(f) === i))(
		'%s imports the middleware',
		(file) => {
			expect(code(file)).toContain("import { idempotency } from '../middleware/idempotency';");
		},
	);
});
