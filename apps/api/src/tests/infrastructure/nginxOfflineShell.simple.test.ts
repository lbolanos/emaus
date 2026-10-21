/**
 * The offline app shell (specs/offline-mode, M1) depends on three files that
 * nginx would otherwise serve with `Cache-Control: public, immutable` for a year
 * (the `\.(js|css|...)$` regex inside `location /`):
 *
 * - sw.js: a frozen service worker never picks up a new deploy;
 * - manifest.webmanifest: the install metadata;
 * - runtime-config.js: carries the `offlineMode` kill switch, which has to reach
 *   the browser on the next load.
 *
 * Nothing fails when these blocks disappear — the app just stops updating — so
 * these asserts make that silence loud. Syntax is not checked (`nginx -t`).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const nginxConf = readFileSync(
	join(__dirname, '..', '..', '..', '..', '..', 'nginx.conf'),
	'utf-8',
);

const exactBlock = (path: string): string => {
	const start = nginxConf.indexOf(`location = ${path} {`);
	if (start === -1) return '';
	return nginxConf.slice(start, nginxConf.indexOf('}', nginxConf.indexOf('add_header Content-Security-Policy', start)) + 1);
};

describe('nginx.conf — offline app shell', () => {
	test.each(['/sw.js', '/manifest.webmanifest', '/runtime-config.js'])(
		'%s has an exact location with no-cache',
		(path) => {
			const block = exactBlock(path);
			expect(block).not.toBe('');
			expect(block).toContain('add_header Cache-Control "no-cache" always;');
			expect(block).not.toContain('immutable');
		},
	);

	test.each(['/sw.js', '/manifest.webmanifest', '/runtime-config.js'])(
		'%s repeats the security headers (add_header is not inherited)',
		(path) => {
			const block = exactBlock(path);
			expect(block).toContain('Strict-Transport-Security');
			expect(block).toContain('X-Content-Type-Options');
			expect(block).toContain('Content-Security-Policy');
		},
	);

	test('the manifest is served with its own media type', () => {
		expect(exactBlock('/manifest.webmanifest')).toContain(
			'types { application/manifest+json webmanifest; }',
		);
	});
});
