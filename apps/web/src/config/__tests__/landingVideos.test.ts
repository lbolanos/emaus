/**
 * La landing sirve las miniaturas desde public/videos/<id>.webp en vez de
 * hotlinkear i.ytimg.com, así que agregar un video sin bajar su miniatura deja
 * un <img> roto que ningún otro test detecta.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { LANDING_VIDEOS } from '../landingVideos';
import es from '../../locales/es.json';
import en from '../../locales/en.json';

const PUBLIC_VIDEOS = resolve(__dirname, '../../../public/videos');

const lookup = (locale: Record<string, any>, key: string) =>
	key.split('.').reduce<any>((node, part) => (node == null ? node : node[part]), locale);

describe('LANDING_VIDEOS', () => {
	it('no está vacía y no repite ids', () => {
		expect(LANDING_VIDEOS.length).toBeGreaterThan(0);
		const ids = LANDING_VIDEOS.map((video) => video.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it.each(LANDING_VIDEOS)('$id tiene su miniatura local en public/videos', (video) => {
		expect(existsSync(resolve(PUBLIC_VIDEOS, `${video.id}.webp`))).toBe(true);
	});

	it.each(LANDING_VIDEOS)('$id tiene título traducido en los dos idiomas', (video) => {
		expect(typeof lookup(es as any, video.titleKey)).toBe('string');
		expect(typeof lookup(en as any, video.titleKey)).toBe('string');
	});

	it.each(LANDING_VIDEOS)('$id trae una duración real para el badge', (video) => {
		expect(video.seconds).toBeGreaterThan(0);
		// Los demos rondan 1-5 min; algo fuera de rango es un dato copiado mal
		expect(video.seconds).toBeLessThan(60 * 15);
	});

	it('solo expone material dirigido a caminantes', () => {
		// La landing es para caminantes: el resto del canal es operación del
		// sistema y se alcanza desde la ayuda in-app. Ver docs/features/landing-page.md
		const walkerFacing = ['jQb3q-mUG-8'];
		for (const video of LANDING_VIDEOS) {
			expect(
				walkerFacing.includes(video.id),
				`${video.id} no está en la lista de videos para caminantes: si es nuevo, agrégalo aquí y al doc`,
			).toBe(true);
		}
	});
});
