import {
	FLYER_LAYOUT_VERSION,
	type FlyerBlockId,
	type FlyerBlockLayout,
	type FlyerImages,
	type FlyerSlot,
} from '@repo/types';
import { FLYER_DEFAULT_LAYOUT } from '@/components/flyer/blockRegistry';

export interface ResolvedFlyerLayout {
	blocks: FlyerBlockLayout[];
	images: FlyerImages;
}

/** What every flyer flavour's block layout looks like, regardless of its id enum. */
export interface AnyBlockLayout {
	id: string;
	slot: FlyerSlot;
	order: number;
	visible: boolean;
}

/** Renumbers `order` to 0..n-1 within each slot, so gaps and ties can't survive a save. */
function normalizeOrder<T extends AnyBlockLayout>(blocks: T[]): T[] {
	const bySlot = new Map<FlyerSlot, T[]>();

	for (const block of blocks) {
		const slot = bySlot.get(block.slot) ?? [];
		slot.push(block);
		bySlot.set(block.slot, slot);
	}

	const result: T[] = [];
	for (const slotBlocks of bySlot.values()) {
		slotBlocks
			.sort((a, b) => a.order - b.order)
			.forEach((block, index) => result.push({ ...block, order: index }));
	}
	return result;
}

/**
 * Reconciles a stored block array against a flavour's default layout:
 * unknown ids and duplicate ids are dropped, blocks the stored layout doesn't
 * mention keep their default placement, and `order` is renumbered per slot.
 *
 * Shared by every flyer flavour (retreat, meeting); each passes its own default
 * layout, which is also what defines the valid ids and slots.
 */
export function reconcileStoredBlocks<T extends AnyBlockLayout>(
	stored: unknown,
	defaultLayout: readonly T[],
): T[] {
	const knownIds = new Set(defaultLayout.map((block) => block.id));
	const knownSlots = new Set(defaultLayout.map((block) => block.slot));

	const seen = new Map<string, T>();
	for (const block of (Array.isArray(stored) ? stored : []) as T[]) {
		if (!block || !knownIds.has(block.id) || !knownSlots.has(block.slot)) continue;
		if (seen.has(block.id)) continue;
		seen.set(block.id, {
			id: block.id,
			slot: block.slot,
			order: Number.isFinite(block.order) ? block.order : 0,
			visible: block.visible !== false,
		} as T);
	}

	// Anything the stored layout doesn't mention keeps its default placement.
	for (const fallback of defaultLayout) {
		if (!seen.has(fallback.id)) seen.set(fallback.id, { ...fallback });
	}

	return normalizeOrder([...seen.values()]);
}

/**
 * Turns whatever is stored in `retreat.flyer_options` into a usable block layout.
 *
 * Stored data is never migrated in place: v1 rows (no `blocks`) resolve to the default
 * arrangement, and v2 rows are reconciled against it so a block added in a later release
 * shows up instead of silently disappearing. Unknown ids are dropped.
 */
export function resolveFlyerLayout(raw: Record<string, any> | null | undefined): ResolvedFlyerLayout {
	const images: FlyerImages = {
		bodyBackground: raw?.images?.bodyBackground || undefined,
		headerBackground: raw?.images?.headerBackground || undefined,
		footerBackground: raw?.images?.footerBackground || undefined,
		logo: raw?.images?.logo || undefined,
	};

	const storedBlocks: unknown = raw?.blocks;
	const isV2 = raw?.layoutVersion === FLYER_LAYOUT_VERSION && Array.isArray(storedBlocks);

	if (!isV2) {
		// v1: only the legacy QR toggles carry over, since they map to a whole block.
		const legacyShowQr = raw?.showQrCodes ?? true;
		const showRegistrationQr = raw?.showQrCodesRegistration ?? legacyShowQr;
		return {
			blocks: FLYER_DEFAULT_LAYOUT.map((block) =>
				block.id === 'registrationQr' ? { ...block, visible: showRegistrationQr } : block,
			),
			images,
		};
	}

	return { blocks: reconcileStoredBlocks<FlyerBlockLayout>(storedBlocks, FLYER_DEFAULT_LAYOUT), images };
}

/**
 * Moves a block to `toSlot` at `toIndex`, renumbering both the source and target slots.
 * Returns a new array; the input is left alone.
 */
export function moveBlockInLayout<T extends AnyBlockLayout>(
	blocks: T[],
	blockId: T['id'],
	toSlot: FlyerSlot,
	toIndex: number,
): T[] {
	const moving = blocks.find((block) => block.id === blockId);
	if (!moving) return blocks;

	const target = blocks
		.filter((block) => block.slot === toSlot && block.id !== blockId)
		.sort((a, b) => a.order - b.order);

	const clampedIndex = Math.max(0, Math.min(toIndex, target.length));
	target.splice(clampedIndex, 0, { ...moving, slot: toSlot });

	// Stamp the new positions before normalising: normalizeOrder sorts by `order`, so
	// leaving the old values here would undo the splice.
	const reordered = target.map((block, index) => ({ ...block, order: index }));

	const untouched = blocks.filter((block) => block.slot !== toSlot && block.id !== blockId);
	return normalizeOrder([...untouched, ...reordered]);
}
