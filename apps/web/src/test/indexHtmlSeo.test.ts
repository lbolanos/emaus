/**
 * `apps/web/index.html` es la única fuente de las metas que leen WhatsApp,
 * Facebook y Telegram al compartir la home: los rastreadores no ejecutan
 * JavaScript, así que nada de lo que pinte Vue les llega.
 *
 * El archivo vivió mucho tiempo con `<title>Emaus</title>` y sin Open Graph;
 * estos asserts evitan volver ahí sin darse cuenta.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');

const meta = (attr: 'property' | 'name', key: string) => {
	const match = html.match(
		new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'i'),
	);
	return match?.[1];
};

describe('metas de index.html', () => {
	it('tiene un title descriptivo, no el placeholder', () => {
		const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
		expect(title.length).toBeGreaterThan(20);
		expect(title).not.toBe('Emaus');
	});

	it('tiene meta description', () => {
		expect(meta('name', 'description')).toBeTruthy();
	});

	it('tiene el Open Graph que arma la tarjeta al compartir', () => {
		expect(meta('property', 'og:title')).toBeTruthy();
		expect(meta('property', 'og:description')).toBeTruthy();
		expect(meta('property', 'og:type')).toBe('website');
		expect(meta('property', 'og:site_name')).toBeTruthy();
	});

	it('declara una og:image absoluta con sus dimensiones', () => {
		const image = meta('property', 'og:image');
		// Relativa no sirve: los rastreadores no resuelven rutas del sitio
		expect(image).toMatch(/^https:\/\//);
		expect(meta('property', 'og:image:width')).toBe('1200');
		expect(meta('property', 'og:image:height')).toBe('630');
	});

	it('declara la twitter card grande', () => {
		expect(meta('name', 'twitter:card')).toBe('summary_large_image');
	});

	it('mantiene los polyfills de Safari iOS antiguo', () => {
		// Quitarlos deja la app en blanco en iPhones < 15.4 (skill safari-ios-compatibility)
		expect(html).toContain('Array.prototype.at');
		expect(html).toContain('String.prototype.replaceAll');
	});
});
