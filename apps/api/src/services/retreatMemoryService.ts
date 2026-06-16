import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRepository } from '../utils/repositoryHelpers';
import { Retreat } from '../entities/retreat.entity';
import { RetreatMemoryPhoto } from '../entities/retreatMemoryPhoto.entity';
import { RetreatMemorySong } from '../entities/retreatMemorySong.entity';
import { RetreatScheduleItem } from '../entities/retreatScheduleItem.entity';
import { imageService } from './imageService';
import { avatarStorageService } from './avatarStorageService';
import { s3Service } from './s3Service';

// Defensive cap so a single retreat can't accumulate unbounded uploads.
export const MAX_MEMORY_PHOTOS = 30;
export const MAX_MEMORY_SONGS = 30;

const photoOrder = { isPrimary: 'DESC', sortOrder: 'ASC', createdAt: 'ASC' } as const;
const songOrder = { isPrimary: 'DESC', sortOrder: 'ASC', createdAt: 'ASC' } as const;

/**
 * Return a shallow copy of a memory photo with its `url` swapped for a
 * short-lived presigned URL when it points at the private S3 prefix. Non-S3
 * (base64) photos and base64-mode deployments pass through unchanged.
 */
export async function presignMemoryPhoto<T extends { url: string }>(photo: T): Promise<T> {
	return { ...photo, url: await s3Service.presignPrivateUrl(photo.url) };
}

/**
 * Presign the memory-photo URLs carried on a retreat object before it is
 * serialized to the client: the legacy single-value `memoryPhotoUrl` mirror and
 * every photo in the `memoryPhotos` relation (when loaded). Mutates and returns
 * the same object — only ever called on read paths that discard it afterwards.
 */
export async function presignRetreatMemoryUrls<
	T extends { memoryPhotoUrl?: string | null; memoryPhotos?: { url: string }[] } | null | undefined,
>(retreat: T): Promise<T> {
	if (!retreat) return retreat;
	if (retreat.memoryPhotoUrl) {
		retreat.memoryPhotoUrl = await s3Service.presignPrivateUrl(retreat.memoryPhotoUrl);
	}
	if (Array.isArray(retreat.memoryPhotos)) {
		retreat.memoryPhotos = await Promise.all(retreat.memoryPhotos.map(presignMemoryPhoto));
	}
	return retreat;
}

/**
 * Keep the legacy single-value `retreat.memoryPhotoUrl` in sync with whichever
 * photo is currently primary (or null when none). This mirror keeps existing
 * consumers (dashboard, legacy card) working unchanged.
 */
async function syncDerivedPhotoUrl(retreatId: string, ds?: DataSource): Promise<void> {
	const photoRepo = getRepository(RetreatMemoryPhoto, ds);
	const primary = await photoRepo.findOne({ where: { retreatId, isPrimary: true } });
	const retreatRepo = getRepository(Retreat, ds);
	await retreatRepo.update({ id: retreatId }, { memoryPhotoUrl: (primary?.url ?? null) as any });
}

async function syncDerivedSongUrl(retreatId: string, ds?: DataSource): Promise<void> {
	// Only 'manual' songs mirror musicPlaylistUrl; MAM-imported songs never do.
	const songRepo = getRepository(RetreatMemorySong, ds);
	const primary = await songRepo.findOne({
		where: { retreatId, source: 'manual', isPrimary: true },
	});
	const retreatRepo = getRepository(Retreat, ds);
	await retreatRepo.update(
		{ id: retreatId },
		{ musicPlaylistUrl: (primary?.url ?? null) as any },
	);
}

export const retreatMemoryService = {
	async listMemories(retreatId: string, ds?: DataSource) {
		const photoRepo = getRepository(RetreatMemoryPhoto, ds);
		const songRepo = getRepository(RetreatMemorySong, ds);
		const [photos, songs] = await Promise.all([
			photoRepo.find({ where: { retreatId }, order: photoOrder }),
			songRepo.find({ where: { retreatId }, order: songOrder }),
		]);
		// Photos live under a private S3 prefix: hand the client presigned URLs.
		const signedPhotos = await Promise.all(photos.map(presignMemoryPhoto));
		return { photos: signedPhotos, songs };
	},

	async addPhoto(retreatId: string, photoData: string, ds?: DataSource) {
		const photoRepo = getRepository(RetreatMemoryPhoto, ds);
		const count = await photoRepo.count({ where: { retreatId } });
		if (count >= MAX_MEMORY_PHOTOS) {
			throw Object.assign(
				new Error(`Máximo ${MAX_MEMORY_PHOTOS} fotos por retiro.`),
				{ statusCode: 400 },
			);
		}

		const photoId = uuidv4();
		let url: string;
		let s3Key: string | null = null;

		if (avatarStorageService.isS3Storage()) {
			// Reuse the corrected image flow: destructure base64ToBuffer and pass
			// the detected contentType (NOT the wrapper object / "image/*").
			const { buffer, contentType } = imageService.base64ToBuffer(photoData);
			const processed = await imageService.processAvatar(buffer, contentType);
			const result = await s3Service.uploadRetreatMemoryPhotoById(
				retreatId,
				photoId,
				processed.buffer,
				processed.contentType,
			);
			url = result.url;
			s3Key = result.key;
		} else {
			// Modo base64 (sin S3): el formato/tamaño se validan en la frontera
			// (createRetreatMemoryPhotoSchema en la ruta POST /:id/memory-photos), que
			// es el único caller. Aquí solo se persiste el data-URI ya validado.
			url = photoData;
		}

		const isPrimary = count === 0;
		const photo = photoRepo.create({
			id: photoId,
			retreatId,
			url,
			s3Key,
			isPrimary,
			sortOrder: count,
		});
		await photoRepo.save(photo);

		if (isPrimary) {
			await syncDerivedPhotoUrl(retreatId, ds);
		}
		return photo;
	},

	async deletePhoto(retreatId: string, photoId: string, ds?: DataSource) {
		const photoRepo = getRepository(RetreatMemoryPhoto, ds);
		const photo = await photoRepo.findOne({ where: { id: photoId, retreatId } });
		if (!photo) {
			throw Object.assign(new Error('Foto no encontrada.'), { statusCode: 404 });
		}

		if (photo.s3Key && avatarStorageService.isS3Storage()) {
			try {
				await s3Service.deleteRetreatMemoryPhotoByKey(photo.s3Key);
			} catch (err) {
				// Don't block the DB delete if the S3 object is already gone.
				console.warn(`[retreatMemoryService] S3 delete failed for ${photo.s3Key}:`, err);
			}
		}

		const wasPrimary = photo.isPrimary;
		await photoRepo.remove(photo);

		if (wasPrimary) {
			// Promote the next photo (lowest sortOrder) to primary.
			const next = await photoRepo.findOne({
				where: { retreatId },
				order: { sortOrder: 'ASC', createdAt: 'ASC' },
			});
			if (next) {
				next.isPrimary = true;
				await photoRepo.save(next);
			}
			await syncDerivedPhotoUrl(retreatId, ds);
		}
	},

	async setPrimaryPhoto(retreatId: string, photoId: string, ds?: DataSource) {
		const photoRepo = getRepository(RetreatMemoryPhoto, ds);
		const photo = await photoRepo.findOne({ where: { id: photoId, retreatId } });
		if (!photo) {
			throw Object.assign(new Error('Foto no encontrada.'), { statusCode: 404 });
		}
		await photoRepo.update({ retreatId }, { isPrimary: false });
		await photoRepo.update({ id: photoId, retreatId }, { isPrimary: true });
		await syncDerivedPhotoUrl(retreatId, ds);
	},

	async addSong(
		retreatId: string,
		data: { url: string; title?: string },
		ds?: DataSource,
	) {
		const songRepo = getRepository(RetreatMemorySong, ds);
		// Count/primary/order are scoped to manual songs (MAM songs live apart).
		const count = await songRepo.count({ where: { retreatId, source: 'manual' } });
		if (count >= MAX_MEMORY_SONGS) {
			throw Object.assign(
				new Error(`Máximo ${MAX_MEMORY_SONGS} canciones por retiro.`),
				{ statusCode: 400 },
			);
		}

		const isPrimary = count === 0;
		const song = songRepo.create({
			id: uuidv4(),
			retreatId,
			url: data.url,
			title: data.title ?? null,
			source: 'manual',
			isPrimary,
			sortOrder: count,
		});
		await songRepo.save(song);

		if (isPrimary) {
			await syncDerivedSongUrl(retreatId, ds);
		}
		return song;
	},

	async updateSong(
		retreatId: string,
		songId: string,
		data: { url?: string; title?: string },
		ds?: DataSource,
	) {
		const songRepo = getRepository(RetreatMemorySong, ds);
		const song = await songRepo.findOne({ where: { id: songId, retreatId } });
		if (!song) {
			throw Object.assign(new Error('Canción no encontrada.'), { statusCode: 404 });
		}
		if (data.url !== undefined) song.url = data.url;
		if (data.title !== undefined) song.title = data.title ?? null;
		await songRepo.save(song);

		if (song.isPrimary) {
			await syncDerivedSongUrl(retreatId, ds);
		}
		return song;
	},

	async deleteSong(retreatId: string, songId: string, ds?: DataSource) {
		const songRepo = getRepository(RetreatMemorySong, ds);
		const song = await songRepo.findOne({ where: { id: songId, retreatId } });
		if (!song) {
			throw Object.assign(new Error('Canción no encontrada.'), { statusCode: 404 });
		}
		const wasPrimary = song.isPrimary;
		await songRepo.remove(song);

		if (wasPrimary) {
			// Promote the next MANUAL song (a MAM song is never primary).
			const next = await songRepo.findOne({
				where: { retreatId, source: 'manual' },
				order: { sortOrder: 'ASC', createdAt: 'ASC' },
			});
			if (next) {
				next.isPrimary = true;
				await songRepo.save(next);
			}
			await syncDerivedSongUrl(retreatId, ds);
		}
	},

	async setPrimarySong(retreatId: string, songId: string, ds?: DataSource) {
		const songRepo = getRepository(RetreatMemorySong, ds);
		// Only manual songs can be primary.
		const song = await songRepo.findOne({ where: { id: songId, retreatId, source: 'manual' } });
		if (!song) {
			throw Object.assign(new Error('Canción no encontrada.'), { statusCode: 404 });
		}
		await songRepo.update({ retreatId }, { isPrimary: false });
		await songRepo.update({ id: songId, retreatId }, { isPrimary: true });
		await syncDerivedSongUrl(retreatId, ds);
	},

	/**
	 * Import every minute-by-minute item that has a music URL into the gallery as
	 * `source='mam'` songs, titled with the charla/activity name. Additive +
	 * dedup by (url, title) among existing MAM songs, so pressing the button
	 * again only adds what's new. MAM songs never become primary nor touch
	 * `retreat.musicPlaylistUrl`.
	 */
	async importSongsFromMam(retreatId: string, ds?: DataSource) {
		const itemRepo = getRepository(RetreatScheduleItem, ds);
		const songRepo = getRepository(RetreatMemorySong, ds);

		const items = await itemRepo.find({
			where: { retreatId },
			order: { day: 'ASC', orderInDay: 'ASC' },
		});

		const existingMam = await songRepo.find({ where: { retreatId, source: 'mam' } });
		const seen = new Set(existingMam.map((s) => `${s.url} ${s.title ?? ''}`));
		let sortOrder = existingMam.length;

		let imported = 0;
		let skipped = 0;
		for (const item of items) {
			const url = (item.musicTrackUrl ?? '').trim();
			if (!/^https?:\/\//i.test(url)) continue; // only real links
			const title = item.name;
			const key = `${url} ${title}`;
			if (seen.has(key)) {
				skipped++;
				continue;
			}
			seen.add(key);
			const song = songRepo.create({
				id: uuidv4(),
				retreatId,
				url,
				title,
				source: 'mam',
				isPrimary: false,
				sortOrder: sortOrder++,
			});
			await songRepo.save(song);
			imported++;
		}

		return { imported, skipped };
	},
};
