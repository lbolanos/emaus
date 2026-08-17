/**
 * El preview por retiro (docs/features/link-previews-og.md) solo funciona si el
 * bloque de nginx sigue en su sitio: si alguien lo borra o cambia el regex, los
 * rastreadores vuelven a recibir el index.html genérico y NADA falla — el
 * preview simplemente deja de ser del retiro. Estos asserts hacen ruidoso ese
 * silencio.
 *
 * No valida sintaxis de nginx (para eso, `nginx -t` en el servidor).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const nginxConf = readFileSync(
	join(__dirname, '..', '..', '..', '..', '..', 'nginx.conf'),
	'utf-8',
);

describe('nginx.conf — preview por retiro', () => {
	test('atiende /<slug> y /<slug>/server con el mismo patrón que el router de Vue', () => {
		// El router usa /:slug([a-z0-9]+); si las clases divergen, el rastreador
		// pediría una URL que nginx no reconoce como retiro.
		expect(nginxConf).toContain('location ~ ^/([a-z0-9]+)(/server)?$');
	});

	test('proxya al endpoint del API preservando slug y sufijo', () => {
		expect(nginxConf).toMatch(/proxy_pass\s+http:\/\/localhost:3001\/api\/og\/\$og_slug\$og_suffix;/);
	});

	test('guarda los capturados antes del if (no sobreviven al bloque)', () => {
		const block = nginxConf.slice(nginxConf.indexOf('location ~ ^/([a-z0-9]+)'));
		const setSlug = block.indexOf('set $og_slug $1;');
		const ifCrawler = block.indexOf('if ($og_crawler = 1)');
		expect(setSlug).toBeGreaterThan(-1);
		expect(ifCrawler).toBeGreaterThan(setSlug);
	});

	test('cubre los rastreadores que generan preview', () => {
		for (const agent of [
			'facebookexternalhit',
			'WhatsApp',
			'Twitterbot',
			'TelegramBot',
			'Slackbot',
			'LinkedInBot',
			'Discordbot',
		]) {
			expect(nginxConf).toContain(agent);
		}
	});

	test('las personas siguen recibiendo el SPA', () => {
		const block = nginxConf.slice(
			nginxConf.indexOf('location ~ ^/([a-z0-9]+)'),
			nginxConf.indexOf('# This location block handles all Vue app assets'),
		);
		expect(block).toContain('try_files $uri $uri/ /index.html;');
	});

	test('el bloque repite las cabeceras de seguridad (add_header no se hereda)', () => {
		const block = nginxConf.slice(
			nginxConf.indexOf('location ~ ^/([a-z0-9]+)'),
			nginxConf.indexOf('# This location block handles all Vue app assets'),
		);
		expect(block).toContain('Strict-Transport-Security');
		expect(block).toContain('X-Content-Type-Options');
		expect(block).toContain('Content-Security-Policy');
	});
});
