/**
 * Static source-level test that verifies `communityCommunicationRoutes.ts`
 * exposes every endpoint the frontend invokes. The web client calls
 * `POST /community-communications/email/send` (apps/web/src/services/api.ts —
 * `sendCommunityEmailViaBackend`) and we recently discovered the route file
 * had the controller but did NOT mount it, which would 404 the request.
 *
 * This test scans the route file source so the regression is caught even
 * without booting Express + supertest.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROUTE_FILE = join(
	__dirname,
	'..',
	'..',
	'routes',
	'communityCommunicationRoutes.ts',
);

const src = readFileSync(ROUTE_FILE, 'utf-8');

// Strip line comments so a commented-out route never satisfies the assertion.
const code = src
	.split('\n')
	.filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
	.join('\n');

describe('communityCommunicationRoutes — endpoints the frontend depends on', () => {
	it('exposes GET /member/:memberId (history listing)', () => {
		expect(code).toMatch(/router\.get\(\s*['"]\/member\/:memberId['"]/);
	});

	it('exposes GET /community/:communityId (community-wide listing)', () => {
		expect(code).toMatch(/router\.get\(\s*['"]\/community\/:communityId['"]/);
	});

	it('exposes POST / (createCommunication used by direct WhatsApp/email flows)', () => {
		expect(code).toMatch(/router\.post\(\s*['"]\/['"]\s*,\s*controller\.createCommunication/);
	});

	it('exposes POST /email/send (sendEmailViaBackend) — regression for missing mount', () => {
		expect(code).toMatch(
			/router\.post\(\s*['"]\/email\/send['"]\s*,\s*controller\.sendEmailViaBackend/,
		);
	});

	it('exposes DELETE /:id', () => {
		expect(code).toMatch(/router\.delete\(\s*['"]\/:id['"]/);
	});
});
