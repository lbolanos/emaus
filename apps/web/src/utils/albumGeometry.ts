export type AlbumBox = [number, number, number, number];

export interface AlbumTag {
	name: string;
	box: AlbumBox;
}

export interface PercentRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

/** Converts a [ymin, xmin, ymax, xmax] box normalized to 0-1000 into CSS percentages. */
export function boxToPercent(box: AlbumBox): PercentRect {
	const [ymin, xmin, ymax, xmax] = box.map((v) => clamp(Number(v) || 0, 0, 1000));
	return {
		left: xmin / 10,
		top: ymin / 10,
		width: Math.max(0, xmax - xmin) / 10,
		height: Math.max(0, ymax - ymin) / 10,
	};
}

/** Lowercases and strips diacritics so "José" matches "jose". */
export function normalizeSearch(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.trim();
}

/** Returns the indexes of tags whose name contains the query (accent/case-insensitive). */
export function searchTagIndexes(tags: AlbumTag[], query: string): number[] {
	const q = normalizeSearch(query);
	const result: number[] = [];
	tags.forEach((tag, index) => {
		if (!q || normalizeSearch(tag.name).includes(q)) result.push(index);
	});
	return result;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 0.5;

export function clampZoom(zoom: number): number {
	return clamp(Math.round(zoom * 100) / 100, MIN_ZOOM, MAX_ZOOM);
}

export interface LabelPlacement {
	vertical: 'above' | 'below';
	horizontal: 'left' | 'center' | 'right';
}

/** Decides where a name label goes so it stays inside the photo frame. */
export function labelPlacement(box: AlbumBox): LabelPlacement {
	const [ymin, xmin, , xmax] = box;
	const centerX = (xmin + xmax) / 2;
	return {
		vertical: ymin < 150 ? 'below' : 'above',
		horizontal: centerX > 750 ? 'right' : centerX < 250 ? 'left' : 'center',
	};
}
