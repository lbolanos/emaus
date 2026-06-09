/**
 * Integration test (TypeORM real, vía testDataSource) para retreatMemoryService:
 * galería de fotos + canciones por retiro con una marcada como "principal".
 *
 * Verifica el invariante de "principal" y el recomputo del campo derivado del
 * retreat (memoryPhotoUrl / musicPlaylistUrl) en cada mutación.
 *
 * En tests AVATAR_STORAGE=base64 (default), así que addPhoto NO toca S3 y la
 * url guardada es el propio data URI.
 */

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Retreat } from '@/entities/retreat.entity';
import { RetreatScheduleItem } from '@/entities/retreatScheduleItem.entity';
import { retreatMemoryService } from '@/services/retreatMemoryService';

const getDS = () => (TestDataFactory as any)['testDataSource'];

let mamSeq = 0;
async function addMamItem(
	retreatId: string,
	name: string,
	musicTrackUrl: string | null,
	orderInDay = mamSeq++,
) {
	const repo = getDS().getRepository(RetreatScheduleItem);
	const item = repo.create({
		retreatId,
		name,
		type: 'charla',
		day: 1,
		startTime: new Date('2026-04-17T09:00:00Z'),
		endTime: new Date('2026-04-17T10:00:00Z'),
		durationMinutes: 60,
		orderInDay,
		status: 'pending',
		musicTrackUrl,
	});
	await repo.save(item);
	return item;
}

async function derivedUrls(retreatId: string) {
	const r = await getDS().getRepository(Retreat).findOne({ where: { id: retreatId } });
	return { photo: r?.memoryPhotoUrl ?? null, song: r?.musicPlaylistUrl ?? null };
}

describe('retreatMemoryService', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
	});

	describe('photos', () => {
		it('marca la primera foto como principal y sincroniza memoryPhotoUrl', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const p1 = await retreatMemoryService.addPhoto(retreat.id, 'data:image/a', getDS());
			expect(p1.isPrimary).toBe(true);
			expect(p1.sortOrder).toBe(0);
			expect((await derivedUrls(retreat.id)).photo).toBe('data:image/a');

			const p2 = await retreatMemoryService.addPhoto(retreat.id, 'data:image/b', getDS());
			expect(p2.isPrimary).toBe(false);
			expect(p2.sortOrder).toBe(1);
			// La principal no cambia al agregar una segunda.
			expect((await derivedUrls(retreat.id)).photo).toBe('data:image/a');
		});

		it('setPrimaryPhoto cambia la principal y deja solo una', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			await retreatMemoryService.addPhoto(retreat.id, 'data:image/a', getDS());
			const p2 = await retreatMemoryService.addPhoto(retreat.id, 'data:image/b', getDS());

			await retreatMemoryService.setPrimaryPhoto(retreat.id, p2.id, getDS());

			const { photos } = await retreatMemoryService.listMemories(retreat.id, getDS());
			expect(photos.filter((p) => p.isPrimary)).toHaveLength(1);
			expect(photos.find((p) => p.isPrimary)?.id).toBe(p2.id);
			expect((await derivedUrls(retreat.id)).photo).toBe('data:image/b');
		});

		it('al borrar la principal promueve la siguiente; borrar la última deja null', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const p1 = await retreatMemoryService.addPhoto(retreat.id, 'data:image/a', getDS());
			const p2 = await retreatMemoryService.addPhoto(retreat.id, 'data:image/b', getDS());

			// Borra la principal (p1) → p2 debe pasar a principal.
			await retreatMemoryService.deletePhoto(retreat.id, p1.id, getDS());
			let memories = await retreatMemoryService.listMemories(retreat.id, getDS());
			expect(memories.photos).toHaveLength(1);
			expect(memories.photos[0].id).toBe(p2.id);
			expect(memories.photos[0].isPrimary).toBe(true);
			expect((await derivedUrls(retreat.id)).photo).toBe('data:image/b');

			// Borra la última → derivado en null.
			await retreatMemoryService.deletePhoto(retreat.id, p2.id, getDS());
			memories = await retreatMemoryService.listMemories(retreat.id, getDS());
			expect(memories.photos).toHaveLength(0);
			expect((await derivedUrls(retreat.id)).photo).toBeNull();
		});
	});

	describe('songs', () => {
		it('agrega canción con título y marca la primera como principal', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const s1 = await retreatMemoryService.addSong(
				retreat.id,
				{ url: 'https://spotify.com/a', title: 'Cantos viernes' },
				getDS(),
			);
			expect(s1.isPrimary).toBe(true);
			expect(s1.title).toBe('Cantos viernes');
			expect((await derivedUrls(retreat.id)).song).toBe('https://spotify.com/a');

			const s2 = await retreatMemoryService.addSong(retreat.id, { url: 'https://yt.com/b' }, getDS());
			expect(s2.isPrimary).toBe(false);
			expect(s2.title).toBeNull();
		});

		it('updateSong cambia url/título y resincroniza si es la principal', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const s1 = await retreatMemoryService.addSong(retreat.id, { url: 'https://a.com' }, getDS());

			await retreatMemoryService.updateSong(
				retreat.id,
				s1.id,
				{ url: 'https://b.com', title: 'Nueva' },
				getDS(),
			);
			expect((await derivedUrls(retreat.id)).song).toBe('https://b.com');
		});

		it('setPrimarySong + borrar la principal promueve la siguiente', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const s1 = await retreatMemoryService.addSong(retreat.id, { url: 'https://a.com' }, getDS());
			const s2 = await retreatMemoryService.addSong(retreat.id, { url: 'https://b.com' }, getDS());

			await retreatMemoryService.setPrimarySong(retreat.id, s2.id, getDS());
			expect((await derivedUrls(retreat.id)).song).toBe('https://b.com');

			await retreatMemoryService.deleteSong(retreat.id, s2.id, getDS());
			const { songs } = await retreatMemoryService.listMemories(retreat.id, getDS());
			expect(songs).toHaveLength(1);
			expect(songs[0].isPrimary).toBe(true);
			expect((await derivedUrls(retreat.id)).song).toBe('https://a.com');
		});
	});

	describe('importSongsFromMam', () => {
		it('importa items del MAM con música http como source=mam, titulados por el nombre', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			await addMamItem(retreat.id, 'Charla: La Rosa', 'https://spotify.com/rosa', 0);
			await addMamItem(retreat.id, 'Testimonio 1', 'https://yt.com/t1', 1);
			await addMamItem(retreat.id, 'Sin música', null, 2);
			await addMamItem(retreat.id, 'URL inválida', 'no-es-url', 3);

			const res = await retreatMemoryService.importSongsFromMam(retreat.id, getDS());
			expect(res).toEqual({ imported: 2, skipped: 0 });

			const { songs } = await retreatMemoryService.listMemories(retreat.id, getDS());
			const mam = songs.filter((s) => s.source === 'mam');
			expect(mam).toHaveLength(2);
			expect(mam.every((s) => s.isPrimary === false)).toBe(true);
			expect(mam.map((s) => s.title)).toEqual(
				expect.arrayContaining(['Charla: La Rosa', 'Testimonio 1']),
			);
			// No toca el derivado musicPlaylistUrl (eso es solo de las manuales).
			expect((await derivedUrls(retreat.id)).song).toBeNull();
		});

		it('re-importar omite duplicadas (mismo url+título)', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			await addMamItem(retreat.id, 'Charla A', 'https://a.com', 0);

			expect(await retreatMemoryService.importSongsFromMam(retreat.id, getDS())).toEqual({
				imported: 1,
				skipped: 0,
			});
			// Segunda vez: nada nuevo.
			expect(await retreatMemoryService.importSongsFromMam(retreat.id, getDS())).toEqual({
				imported: 0,
				skipped: 1,
			});
			const { songs } = await retreatMemoryService.listMemories(retreat.id, getDS());
			expect(songs.filter((s) => s.source === 'mam')).toHaveLength(1);
		});

		it('no afecta la canción manual principal ni su derivado', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const manual = await retreatMemoryService.addSong(
				retreat.id,
				{ url: 'https://manual.com', title: 'Playlist' },
				getDS(),
			);
			await addMamItem(retreat.id, 'Charla X', 'https://mam.com', 0);

			await retreatMemoryService.importSongsFromMam(retreat.id, getDS());

			const { songs } = await retreatMemoryService.listMemories(retreat.id, getDS());
			const primaryIds = songs.filter((s) => s.isPrimary).map((s) => s.id);
			expect(primaryIds).toEqual([manual.id]); // sigue siendo la única principal
			expect((await derivedUrls(retreat.id)).song).toBe('https://manual.com');
		});
	});

	it('listMemories devuelve la principal primero', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		await retreatMemoryService.addPhoto(retreat.id, 'data:image/a', getDS());
		const p2 = await retreatMemoryService.addPhoto(retreat.id, 'data:image/b', getDS());
		await retreatMemoryService.setPrimaryPhoto(retreat.id, p2.id, getDS());

		const { photos } = await retreatMemoryService.listMemories(retreat.id, getDS());
		expect(photos[0].id).toBe(p2.id);
		expect(photos[0].isPrimary).toBe(true);
	});
});
