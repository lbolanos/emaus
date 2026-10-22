import sharp from 'sharp';
import { AppDataSource } from '../data-source';
import { CommunityMember } from '../entities/communityMember.entity';
import { CommunityAttendance } from '../entities/communityAttendance.entity';
import { s3Service } from './s3Service';
import { detectFaces, FaceModelError } from './faceModelClient';

/**
 * Face matching for community attendance (specs/community-attendance-faces, M3).
 *
 * One model call per group photo: [group photo, numbered gallery of profile photos] ->
 * faces with a box and the gallery number it looks like. The number -> memberId map only
 * lives inside the call. Nothing biometric is stored: no vectors, no indexes.
 */

export const GALLERY_MAX_MEMBERS = 48;
const GALLERY_COLUMNS = 6;
const TILE_W = 140;
const TILE_H = 160;
const LABEL_H = 28;
const CELL_H = TILE_H + LABEL_H;
const GROUP_PHOTO_MAX_SIDE = 3200;
const CROP_MARGIN = 0.3;
const CROP_MIN_SIDE = 48;
const CROP_OUT_MAX = 512;
const GALLERY_CACHE_TTL_MS = 10 * 60 * 1000;

export type FaceBox = [number, number, number, number];

export interface FaceSuggestion {
	box: FaceBox;
	/** JPEG data URL of the face, <= 512 px. */
	crop: string;
	suggestedMemberId: string | null;
}

export interface FaceMatchResult {
	faces: FaceSuggestion[];
	degraded?: boolean;
	reason?: 'busy' | 'quota' | 'timeout' | 'error';
}

export class InvalidFaceImageError extends Error {}

interface Gallery {
	/** number (1-based) -> memberId */
	numberToMember: Map<number, string>;
	image: Buffer;
}

const galleryCache = new Map<string, { builtAt: number; gallery: Gallery | null }>();

/** Drop the cached gallery of a community (photo set/deleted, opt-out changed). */
export function invalidateFaceGallery(communityId: string): void {
	galleryCache.delete(communityId);
}

/** Test hook. */
export function clearFaceGalleryCache(): void {
	galleryCache.clear();
}

// --- Gallery -----------------------------------------------------------------------------

/** 7-segment digit shapes drawn as rects: no font needed (headless Linux has none). */
const SEGMENTS: Record<string, string> = {
	'0': 'abcdef',
	'1': 'bc',
	'2': 'abged',
	'3': 'abgcd',
	'4': 'fgbc',
	'5': 'afgcd',
	'6': 'afgedc',
	'7': 'abc',
	'8': 'abcdefg',
	'9': 'abcdfg',
};

function numberLabelSvg(n: number): string {
	const digits = String(n).split('');
	const dw = 14;
	const dh = 22;
	const t = 3;
	const gap = 6;
	const totalW = digits.length * dw + (digits.length - 1) * gap;
	const x0 = Math.round((TILE_W - totalW) / 2);
	const y0 = Math.round((LABEL_H - dh) / 2);
	const rects: string[] = [];
	digits.forEach((d, i) => {
		const x = x0 + i * (dw + gap);
		const segs = SEGMENTS[d] ?? '';
		const r = (sx: number, sy: number, w: number, h: number) =>
			`<rect x="${x + sx}" y="${y0 + sy}" width="${w}" height="${h}" fill="#fff"/>`;
		if (segs.includes('a')) rects.push(r(0, 0, dw, t));
		if (segs.includes('g')) rects.push(r(0, (dh - t) / 2, dw, t));
		if (segs.includes('d')) rects.push(r(0, dh - t, dw, t));
		if (segs.includes('f')) rects.push(r(0, 0, t, dh / 2 + t / 2));
		if (segs.includes('b')) rects.push(r(dw - t, 0, t, dh / 2 + t / 2));
		if (segs.includes('e')) rects.push(r(0, dh / 2 - t / 2, t, dh / 2 + t / 2));
		if (segs.includes('c')) rects.push(r(dw - t, dh / 2 - t / 2, t, dh / 2 + t / 2));
	});
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${LABEL_H}"><rect width="${TILE_W}" height="${LABEL_H}" fill="#000"/>${rects.join('')}</svg>`;
}

/** Bytes of a stored member photo (data URI in base64 mode, signed S3 URL otherwise). */
async function readMemberPhoto(photoUrl: string): Promise<Buffer | null> {
	try {
		if (photoUrl.startsWith('data:')) {
			const comma = photoUrl.indexOf(',');
			if (comma < 0) return null;
			return Buffer.from(photoUrl.slice(comma + 1), 'base64');
		}
		const signed = await s3Service.presignPrivateUrl(photoUrl);
		const res = await fetch(signed, { signal: AbortSignal.timeout(10_000) });
		if (!res.ok) return null;
		return Buffer.from(await res.arrayBuffer());
	} catch {
		return null;
	}
}

async function pickGalleryMembers(communityId: string): Promise<CommunityMember[]> {
	const members = await AppDataSource.getRepository(CommunityMember)
		.createQueryBuilder('m')
		.where('m.communityId = :communityId', { communityId })
		.andWhere('m.photoUrl IS NOT NULL')
		.andWhere("m.photoUrl != ''")
		.andWhere('m.faceRecognitionOptOut = :optOut', { optOut: false })
		.getMany();
	if (members.length <= GALLERY_MAX_MEMBERS) return members;

	const rows: { memberId: string; last: string | null }[] = await AppDataSource.getRepository(
		CommunityAttendance,
	)
		.createQueryBuilder('a')
		.select('a.memberId', 'memberId')
		.addSelect('MAX(a.recordedAt)', 'last')
		.where('a.attended = :attended', { attended: true })
		.andWhere('a.memberId IN (:...ids)', { ids: members.map((m) => m.id) })
		.groupBy('a.memberId')
		.getRawMany();
	const lastByMember = new Map(rows.map((r) => [r.memberId, r.last ?? '']));
	return members
		.sort((a, b) => (lastByMember.get(b.id) ?? '').localeCompare(lastByMember.get(a.id) ?? ''))
		.slice(0, GALLERY_MAX_MEMBERS);
}

async function buildGallery(communityId: string): Promise<Gallery | null> {
	const members = await pickGalleryMembers(communityId);
	const tiles: { memberId: string; tile: Buffer }[] = [];
	for (const member of members) {
		const raw = await readMemberPhoto(member.photoUrl as string);
		if (!raw) continue;
		try {
			const tile = await sharp(raw)
				.rotate()
				.resize(TILE_W, TILE_H, { fit: 'cover', position: sharp.strategy.attention })
				.jpeg({ quality: 85 })
				.toBuffer();
			tiles.push({ memberId: member.id, tile });
		} catch {
			// Not a decodable image: leave the member out of the gallery.
		}
	}
	if (tiles.length === 0) return null;

	const rows = Math.ceil(tiles.length / GALLERY_COLUMNS);
	const composites: sharp.OverlayOptions[] = [];
	const numberToMember = new Map<number, string>();
	for (let i = 0; i < tiles.length; i++) {
		const number = i + 1;
		numberToMember.set(number, tiles[i].memberId);
		const left = (i % GALLERY_COLUMNS) * TILE_W;
		const top = Math.floor(i / GALLERY_COLUMNS) * CELL_H;
		composites.push({ input: tiles[i].tile, left, top });
		composites.push({ input: Buffer.from(numberLabelSvg(number)), left, top: top + TILE_H });
	}
	const image = await sharp({
		create: {
			width: GALLERY_COLUMNS * TILE_W,
			height: rows * CELL_H,
			channels: 3,
			background: '#000000',
		},
	})
		.composite(composites)
		.jpeg({ quality: 85 })
		.toBuffer();
	return { numberToMember, image };
}

async function getGallery(communityId: string): Promise<Gallery | null> {
	const cached = galleryCache.get(communityId);
	if (cached && Date.now() - cached.builtAt < GALLERY_CACHE_TTL_MS) return cached.gallery;
	const gallery = await buildGallery(communityId);
	galleryCache.set(communityId, { builtAt: Date.now(), gallery });
	return gallery;
}

/** Test/inspection hook: the member ids in the gallery of a community, by number. */
export async function getGalleryMemberIds(communityId: string): Promise<string[]> {
	const gallery = await getGallery(communityId);
	return gallery ? [...gallery.numberToMember.values()] : [];
}

// --- Post-processing ---------------------------------------------------------------------

export interface RawFace {
	box: number[];
	match: number | null;
	confidence?: number;
}

const clamp1000 = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));

/**
 * Pure. Normalises boxes, drops degenerate ones, maps gallery numbers to member ids
 * (out of range -> null), and sends a member suggested for two faces to null in both (FR-16).
 */
export function postProcessFaces(
	raw: RawFace[],
	numberToMember: Map<number, string>,
): { box: FaceBox; suggestedMemberId: string | null }[] {
	const faces = raw
		.filter((f) => Array.isArray(f.box) && f.box.length === 4 && f.box.every(Number.isFinite))
		.map((f) => {
			const [a, b, c, d] = f.box.map(clamp1000);
			const box: FaceBox = [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
			const suggestedMemberId =
				typeof f.match === 'number' && Number.isInteger(f.match)
					? (numberToMember.get(f.match) ?? null)
					: null;
			return { box, suggestedMemberId };
		})
		.filter((f) => f.box[2] > f.box[0] && f.box[3] > f.box[1]);

	const counts = new Map<string, number>();
	for (const f of faces) {
		if (f.suggestedMemberId) counts.set(f.suggestedMemberId, (counts.get(f.suggestedMemberId) ?? 0) + 1);
	}
	return faces.map((f) =>
		f.suggestedMemberId && (counts.get(f.suggestedMemberId) ?? 0) > 1
			? { ...f, suggestedMemberId: null }
			: f,
	);
}

// --- Crops -------------------------------------------------------------------------------

async function cropFace(photo: Buffer, width: number, height: number, box: FaceBox): Promise<string> {
	const [yMin, xMin, yMax, xMax] = box;
	const bx = (xMin / 1000) * width;
	const by = (yMin / 1000) * height;
	const bw = ((xMax - xMin) / 1000) * width;
	const bh = ((yMax - yMin) / 1000) * height;
	// Square and tight around the face: in a group photo faces are ~50 px apart, and a wider
	// crop showed the neighbours too, so the reviewer could not tell which face was meant. The
	// same crop may become the member's profile photo (D6), where a centred square fits.
	const side = Math.max(Math.max(bw, bh) * (1 + 2 * CROP_MARGIN), CROP_MIN_SIDE);
	const w = Math.min(side, width);
	const h = Math.min(side, height);
	let left = bx + bw / 2 - w / 2;
	let top = by + bh / 2 - h / 2;
	left = Math.max(0, Math.min(left, width - w));
	top = Math.max(0, Math.min(top, height - h));
	const out = await sharp(photo)
		.extract({
			left: Math.floor(left),
			top: Math.floor(top),
			width: Math.max(1, Math.floor(w)),
			height: Math.max(1, Math.floor(h)),
		})
		.resize(CROP_OUT_MAX, CROP_OUT_MAX, { fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();
	return `data:image/jpeg;base64,${out.toString('base64')}`;
}

// --- Entry point -------------------------------------------------------------------------

/** Decode + validate (magic bytes via sharp) + orient + cap at 3200 px. */
export async function prepareGroupPhoto(
	dataUrl: string,
): Promise<{ buffer: Buffer; width: number; height: number }> {
	const comma = dataUrl.indexOf(',');
	if (comma < 0) throw new InvalidFaceImageError('Invalid image');
	const input = Buffer.from(dataUrl.slice(comma + 1), 'base64');
	try {
		const probe = await sharp(input).metadata();
		if (!probe.format || !['jpeg', 'png', 'webp'].includes(probe.format)) {
			throw new InvalidFaceImageError('Unsupported image format');
		}
		const buffer = await sharp(input)
			.rotate()
			.resize(GROUP_PHOTO_MAX_SIDE, GROUP_PHOTO_MAX_SIDE, {
				fit: 'inside',
				withoutEnlargement: true,
			})
			.jpeg({ quality: 88 })
			.toBuffer();
		const meta = await sharp(buffer).metadata();
		return { buffer, width: meta.width ?? 1, height: meta.height ?? 1 };
	} catch (error) {
		if (error instanceof InvalidFaceImageError) throw error;
		throw new InvalidFaceImageError('Invalid image');
	}
}

/**
 * Analyse a group photo against a community's gallery. Model failures (503/429/timeout/...)
 * come back as `{faces: [], degraded: true}`: the caller answers 200 so the UI opens in manual
 * mode (spec D12). An empty gallery still detects faces but suggests nobody.
 */
export async function analyzeGroupPhoto(
	communityId: string,
	imageDataUrl: string,
): Promise<FaceMatchResult> {
	const photo = await prepareGroupPhoto(imageDataUrl);
	const gallery = await getGallery(communityId);

	let response;
	try {
		response = await detectFaces({
			photo: photo.buffer,
			// With no gallery the second image is a blank tile so the model still detects faces.
			gallery:
				gallery?.image ??
				(await sharp({
					create: { width: TILE_W, height: CELL_H, channels: 3, background: '#000000' },
				})
					.jpeg()
					.toBuffer()),
		});
	} catch (error) {
		const kind = error instanceof FaceModelError ? error.kind : 'error';
		console.warn(`[faceMatch] model call failed: ${kind}`);
		return { faces: [], degraded: true, reason: kind };
	}

	const processed = postProcessFaces(response.faces, gallery?.numberToMember ?? new Map());
	const faces: FaceSuggestion[] = [];
	for (const f of processed) {
		faces.push({
			box: f.box,
			crop: await cropFace(photo.buffer, photo.width, photo.height, f.box),
			suggestedMemberId: f.suggestedMemberId,
		});
	}
	return { faces };
}
