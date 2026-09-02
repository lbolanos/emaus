import { describe, it, expect } from 'vitest';
import type { FlyerBlockLayout } from '@repo/types';
import { resolveFlyerLayout, moveBlockInLayout } from '../flyerLayout';
import { FLYER_DEFAULT_LAYOUT } from '@/components/flyer/blockRegistry';

const ids = (blocks: FlyerBlockLayout[]) => blocks.map((b) => b.id).sort();
const inSlot = (blocks: FlyerBlockLayout[], slot: string) =>
	blocks
		.filter((b) => b.slot === slot)
		.sort((a, b) => a.order - b.order)
		.map((b) => b.id);

describe('resolveFlyerLayout', () => {
	describe('v1 (legacy) options', () => {
		it('falls back to the default layout when there are no options at all', () => {
			expect(resolveFlyerLayout(undefined).blocks).toEqual(FLYER_DEFAULT_LAYOUT);
			expect(resolveFlyerLayout(null).blocks).toEqual(FLYER_DEFAULT_LAYOUT);
		});

		it('keeps the default layout for a v1 row that only has text overrides', () => {
			const resolved = resolveFlyerLayout({ hopeOverride: 'Encuentro', showPickupInfo: true });
			expect(resolved.blocks).toEqual(FLYER_DEFAULT_LAYOUT);
		});

		it('translates showQrCodesRegistration into the block visibility', () => {
			const resolved = resolveFlyerLayout({ showQrCodesRegistration: false });
			const qr = resolved.blocks.find((b) => b.id === 'registrationQr');
			expect(qr?.visible).toBe(false);
			// Every other block stays visible
			expect(resolved.blocks.filter((b) => b.visible === false)).toHaveLength(1);
		});

		it('translates the deprecated showQrCodes flag too', () => {
			const resolved = resolveFlyerLayout({ showQrCodes: false });
			expect(resolved.blocks.find((b) => b.id === 'registrationQr')?.visible).toBe(false);
		});

		it('ignores a blocks array that is not tagged as v2', () => {
			const resolved = resolveFlyerLayout({
				blocks: [{ id: 'intro', slot: 'wide', order: 0, visible: true }],
			});
			expect(resolved.blocks).toEqual(FLYER_DEFAULT_LAYOUT);
		});
	});

	describe('v2 options', () => {
		it('honours a stored layout', () => {
			const resolved = resolveFlyerLayout({
				layoutVersion: 2,
				blocks: [
					{ id: 'payment', slot: 'left', order: 0, visible: true },
					{ id: 'intro', slot: 'wide', order: 0, visible: true },
					{ id: 'startTime', slot: 'right', order: 0, visible: false },
					{ id: 'endTime', slot: 'right', order: 1, visible: true },
					{ id: 'location', slot: 'left', order: 1, visible: true },
					{ id: 'contact', slot: 'right', order: 2, visible: true },
					{ id: 'whatToBring', slot: 'wide', order: 1, visible: true },
					{ id: 'registrationQr', slot: 'right', order: 3, visible: true },
				],
			});

			expect(inSlot(resolved.blocks, 'left')).toEqual(['payment', 'location']);
			expect(inSlot(resolved.blocks, 'wide')).toEqual(['intro', 'whatToBring']);
			expect(resolved.blocks.find((b) => b.id === 'startTime')?.visible).toBe(false);
		});

		it('re-adds a block the stored layout never heard of, at its default spot', () => {
			// A layout saved before `whatToBring` existed
			const resolved = resolveFlyerLayout({
				layoutVersion: 2,
				blocks: [{ id: 'intro', slot: 'left', order: 0, visible: true }],
			});

			expect(ids(resolved.blocks)).toEqual(ids(FLYER_DEFAULT_LAYOUT));
			const whatToBring = resolved.blocks.find((b) => b.id === 'whatToBring');
			expect(whatToBring?.slot).toBe('wide');
			expect(whatToBring?.visible).toBe(true);
		});

		it('drops unknown block ids and unknown slots', () => {
			const resolved = resolveFlyerLayout({
				layoutVersion: 2,
				blocks: [
					{ id: 'somethingRemoved', slot: 'left', order: 0, visible: true },
					{ id: 'intro', slot: 'nowhere', order: 0, visible: true },
				],
			} as any);

			expect(ids(resolved.blocks)).toEqual(ids(FLYER_DEFAULT_LAYOUT));
			// intro had an invalid slot, so it fell back to its default one
			expect(resolved.blocks.find((b) => b.id === 'intro')?.slot).toBe('left');
		});

		it('ignores a duplicated block id, keeping the first occurrence', () => {
			const resolved = resolveFlyerLayout({
				layoutVersion: 2,
				blocks: [
					{ id: 'intro', slot: 'wide', order: 0, visible: true },
					{ id: 'intro', slot: 'right', order: 5, visible: false },
				],
			});

			const intros = resolved.blocks.filter((b) => b.id === 'intro');
			expect(intros).toHaveLength(1);
			expect(intros[0].slot).toBe('wide');
		});

		it('renumbers order to be contiguous within each slot', () => {
			const resolved = resolveFlyerLayout({
				layoutVersion: 2,
				blocks: [
					{ id: 'intro', slot: 'left', order: 40, visible: true },
					{ id: 'startTime', slot: 'left', order: 7, visible: true },
				],
			});

			const left = resolved.blocks.filter((b) => b.slot === 'left');
			expect(left.map((b) => b.order).sort()).toEqual([...left.keys()]);
			// Relative order survives (7 < 40); the blocks the layout omitted are re-added
			// with their default order, so they may land in between.
			const leftIds = inSlot(resolved.blocks, 'left');
			expect(leftIds.indexOf('startTime')).toBeLessThan(leftIds.indexOf('intro'));
		});
	});

	describe('images', () => {
		it('leaves every image undefined when there are no overrides', () => {
			expect(resolveFlyerLayout({}).images).toEqual({
				bodyBackground: undefined,
				headerBackground: undefined,
				footerBackground: undefined,
				logo: undefined,
			});
		});

		it('keeps the overrides that are set and treats empty strings as unset', () => {
			const { images } = resolveFlyerLayout({
				images: { bodyBackground: 'https://cdn.example.com/bg.webp', logo: '' },
			});
			expect(images.bodyBackground).toBe('https://cdn.example.com/bg.webp');
			expect(images.logo).toBeUndefined();
		});
	});
});

describe('moveBlockInLayout', () => {
	const layout = (): FlyerBlockLayout[] => resolveFlyerLayout(undefined).blocks;

	it('reorders within the same slot', () => {
		const moved = moveBlockInLayout(layout(), 'endTime', 'left', 0);
		expect(inSlot(moved, 'left')).toEqual(['endTime', 'intro', 'startTime', 'location']);
	});

	it('moves a block to another slot at the requested index', () => {
		const moved = moveBlockInLayout(layout(), 'intro', 'right', 1);
		expect(inSlot(moved, 'right')).toEqual(['registrationQr', 'intro', 'contact', 'payment']);
		expect(inSlot(moved, 'left')).toEqual(['startTime', 'location', 'endTime']);
	});

	it('clamps an index past the end of the target slot', () => {
		const moved = moveBlockInLayout(layout(), 'intro', 'wide', 99);
		expect(inSlot(moved, 'wide')).toEqual(['whatToBring', 'intro']);
	});

	it('keeps orders contiguous in both the source and the target slot', () => {
		const moved = moveBlockInLayout(layout(), 'payment', 'left', 2);
		for (const slot of ['left', 'right', 'wide']) {
			const orders = moved
				.filter((b) => b.slot === slot)
				.map((b) => b.order)
				.sort((a, b) => a - b);
			expect(orders).toEqual([...orders.keys()]);
		}
	});

	it('preserves visibility when moving', () => {
		const hidden = layout().map((b) => (b.id === 'payment' ? { ...b, visible: false } : b));
		const moved = moveBlockInLayout(hidden, 'payment', 'wide', 0);
		expect(moved.find((b) => b.id === 'payment')).toMatchObject({
			slot: 'wide',
			visible: false,
		});
	});

	it('returns the input untouched for an unknown block', () => {
		const original = layout();
		expect(moveBlockInLayout(original, 'nope' as any, 'left', 0)).toBe(original);
	});

	it('does not mutate the array it is given', () => {
		const original = layout();
		const snapshot = JSON.stringify(original);
		moveBlockInLayout(original, 'intro', 'wide', 0);
		expect(JSON.stringify(original)).toBe(snapshot);
	});
});
