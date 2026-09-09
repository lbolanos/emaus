import { describe, it, expect } from 'vitest';
import { convertHtmlToWhatsApp } from '../message';

/**
 * Los correos que quedan guardados en el historial son documentos HTML
 * completos, no fragmentos: traen `<head>` y `<style>`. El recorrido de nodos
 * tomaba también el texto de esas etiquetas, así que el historial mostraba el
 * CSS en crudo donde debía ir el mensaje.
 */
describe('convertHtmlToWhatsApp — documentos de correo completos', () => {
	it('no vuelca el CSS del <style> en el texto', () => {
		const html = `<html><head><style>
			Email Message body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
			.p { color: #333; }
		</style></head><body><p>Hola Pepe,</p><p>Bienvenido al retiro.</p></body></html>`;

		const out = convertHtmlToWhatsApp(html);

		expect(out).toContain('Hola Pepe');
		expect(out).toContain('Bienvenido al retiro');
		expect(out).not.toContain('font-family');
		expect(out).not.toContain('Segoe UI');
		expect(out).not.toContain('{');
	});

	it('no pega el <title> del correo al saludo', () => {
		// El navegador deja <title> como hermano del contenido al usar innerHTML,
		// así que salía "Email MessageHola Pepe".
		const html =
			'<html><head><title>Email Message</title></head><body><p>Hola Pepe</p></body></html>';
		const out = convertHtmlToWhatsApp(html);
		expect(out).toContain('Hola Pepe');
		expect(out).not.toContain('Email Message');
	});

	it('tampoco vuelca el contenido de <script>', () => {
		const html = '<div><script>var a = 1; alert("x");</script><p>Texto real</p></div>';
		const out = convertHtmlToWhatsApp(html);
		expect(out).toContain('Texto real');
		expect(out).not.toContain('alert');
	});

	it('sigue conservando el formato normal de un fragmento', () => {
		const out = convertHtmlToWhatsApp('<p>Hola <strong>Ana</strong></p>');
		expect(out).toContain('Ana');
	});
});
