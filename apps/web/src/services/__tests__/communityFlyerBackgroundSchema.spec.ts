import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
	FLYER_BACKGROUND_PRESETS,
	setCommunityFlyerBackgroundSchema,
	setCommunityFlyerCardOpacitySchema,
} from '@repo/types';

const params = { id: 'f1060047-5305-4f75-89c4-a649e449975e' };

describe('setCommunityFlyerBackgroundSchema — preset o imagen, nunca ambas', () => {
	it('acepta un preset del catálogo', () => {
		const parsed = setCommunityFlyerBackgroundSchema.parse({
			params,
			body: { preset: 'jesus_bg.png' },
		});
		expect(parsed.body.preset).toBe('jesus_bg.png');
	});

	it('acepta un data-URI de imagen', () => {
		const parsed = setCommunityFlyerBackgroundSchema.parse({
			params,
			body: { imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
		});
		expect(parsed.body.imageDataUrl).toContain('data:image/png');
	});

	it('rechaza preset e imageDataUrl a la vez', () => {
		const result = setCommunityFlyerBackgroundSchema.safeParse({
			params,
			body: { preset: 'poster.png', imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
		});
		expect(result.success).toBe(false);
	});

	it('rechaza el body vacío', () => {
		const result = setCommunityFlyerBackgroundSchema.safeParse({ params, body: {} });
		expect(result.success).toBe(false);
	});

	it('rechaza un preset fuera del catálogo', () => {
		const result = setCommunityFlyerBackgroundSchema.safeParse({
			params,
			body: { preset: 'secreto.png' },
		});
		expect(result.success).toBe(false);
	});

	it('sigue rechazando data-URI con MIME no permitido (gif)', () => {
		const result = setCommunityFlyerBackgroundSchema.safeParse({
			params,
			body: { imageDataUrl: 'data:image/gif;base64,R0lGODlh=' },
		});
		expect(result.success).toBe(false);
	});

	it('rechaza un id de comunidad que no es uuid', () => {
		const result = setCommunityFlyerBackgroundSchema.safeParse({
			params: { id: 'no-soy-uuid' },
			body: { preset: 'poster.png' },
		});
		expect(result.success).toBe(false);
	});
});

describe('setCommunityFlyerCardOpacitySchema — el dial vive entre 0.3 y 1', () => {
	// Debajo de 0.3 el texto pelea con el fondo en imágenes claras; el límite
	// viene del schema compartido, así que este test fija el contrato.
	it('acepta los extremos del rango', () => {
		expect(setCommunityFlyerCardOpacitySchema.parse({ params, body: { opacity: 0.3 } }).body.opacity).toBe(0.3);
		expect(setCommunityFlyerCardOpacitySchema.parse({ params, body: { opacity: 1 } }).body.opacity).toBe(1);
	});

	it('rechaza opacidad por debajo de 0.3', () => {
		const result = setCommunityFlyerCardOpacitySchema.safeParse({ params, body: { opacity: 0.29 } });
		expect(result.success).toBe(false);
	});

	it('rechaza opacidad por encima de 1', () => {
		const result = setCommunityFlyerCardOpacitySchema.safeParse({ params, body: { opacity: 1.01 } });
		expect(result.success).toBe(false);
	});

	it('rechaza un body sin opacidad', () => {
		const result = setCommunityFlyerCardOpacitySchema.safeParse({ params, body: {} });
		expect(result.success).toBe(false);
	});

	it('rechaza un id de comunidad que no es uuid', () => {
		const result = setCommunityFlyerCardOpacitySchema.safeParse({
			params: { id: 'no-soy-uuid' },
			body: { opacity: 0.8 },
		});
		expect(result.success).toBe(false);
	});
});

describe('FLYER_BACKGROUND_PRESETS — el catálogo apunta a archivos reales', () => {
	// Un preset sin archivo se renderiza como fondo vacío y nadie se entera
	// hasta que una comunidad lo elige. El cwd de vitest del web es apps/web.
	it('incluye exactamente los cuatro fondos publicados', () => {
		expect([...FLYER_BACKGROUND_PRESETS]).toEqual([
			'poster.png',
			'jesus_bg.png',
			'jesus2.png',
			'cta-bg.webp',
		]);
	});

	it('cada preset existe en public/', () => {
		for (const preset of FLYER_BACKGROUND_PRESETS) {
			expect(existsSync(join(process.cwd(), 'public', preset)), preset).toBe(true);
		}
	});
});
