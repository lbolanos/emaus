import {
	createRetreatMemorySongSchema,
	createRetreatMemoryPhotoSchema,
	httpUrlSchema,
} from '@repo/types';

/**
 * M2 y M3 del security review: validación de URL de canción (anti XSS
 * `javascript:`) y de la subida de foto base64 (formato + tamaño).
 */
describe('Esquemas de recuerdos del retiro — validación de seguridad', () => {
	describe('M2 — URL de canción (httpUrl)', () => {
		it('rechaza javascript: y data:', () => {
			expect(createRetreatMemorySongSchema.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
			expect(httpUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
			expect(httpUrlSchema.safeParse('data:text/html,<script>').success).toBe(false);
		});
		it('acepta http(s)', () => {
			expect(createRetreatMemorySongSchema.safeParse({ url: 'https://youtu.be/abc' }).success).toBe(true);
			expect(httpUrlSchema.safeParse('http://example.com/x.mp3').success).toBe(true);
		});
	});

	describe('M3 — foto base64', () => {
		const tinyPng =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

		it('acepta un data-URI de imagen válido', () => {
			expect(createRetreatMemoryPhotoSchema.safeParse({ photoData: tinyPng }).success).toBe(true);
		});
		it('rechaza contenido que no es imagen', () => {
			expect(
				createRetreatMemoryPhotoSchema.safeParse({ photoData: 'data:text/html;base64,PHNjcmlwdD4=' }).success,
			).toBe(false);
			expect(createRetreatMemoryPhotoSchema.safeParse({ photoData: 'no-soy-imagen' }).success).toBe(false);
		});
		it('rechaza payloads desmesurados (DoS de almacenamiento)', () => {
			const huge = 'data:image/png;base64,' + 'A'.repeat(4_000_001);
			expect(createRetreatMemoryPhotoSchema.safeParse({ photoData: huge }).success).toBe(false);
		});
	});
});
