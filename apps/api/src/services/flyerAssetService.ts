import { randomUUID } from 'crypto';
import type { FlyerAssetKind } from '@repo/types';
import { imageService } from './imageService';
import { s3Service } from './s3Service';
import { avatarStorageService } from './avatarStorageService';

/** Inline data URIs get stored in the retreat row, so keep them small. */
const MAX_INLINE_BYTES = 512 * 1024;

export class FlyerAssetError extends Error {}

/**
 * Stores an image the coordinator picked for a flyer and returns its URL.
 *
 * The object goes under `public-assets/`, not one of the private prefixes: those are
 * served through presigned URLs that expire in an hour, which would break a flyer left
 * open in a tab, exported to PDF later, or shared as a link.
 */
export async function storeFlyerAsset(dataUrl: string, kind: FlyerAssetKind): Promise<string> {
	const { buffer, contentType } = imageService.base64ToBuffer(dataUrl);
	const processed = await imageService.processFlyerAsset(buffer, contentType, kind);

	if (avatarStorageService.isS3Storage()) {
		const path = `flyer-assets/${randomUUID()}-${kind}.webp`;
		const result = await s3Service.uploadPublicAsset(path, processed.buffer, processed.contentType);
		return result.url;
	}

	// No S3 configured (local dev): inline it so the feature still works end to end.
	if (processed.buffer.byteLength > MAX_INLINE_BYTES) {
		throw new FlyerAssetError(
			'La imagen es demasiado grande para guardarla sin S3 configurado.',
		);
	}
	return `data:${processed.contentType};base64,${processed.buffer.toString('base64')}`;
}
