import { describe, it, expect } from 'vitest';
import type { MeetingFlyerBlockLayout } from '@repo/types';
import { resolveMeetingFlyerLayout } from '../meetingFlyerLayout';
import { moveBlockInLayout } from '../flyerLayout';
import { MEETING_FLYER_DEFAULT_LAYOUT } from '@/components/flyers/meetingBlockRegistry';

const ids = (blocks: MeetingFlyerBlockLayout[]) => blocks.map((b) => b.id).sort();
const inSlot = (blocks: MeetingFlyerBlockLayout[], slot: string) =>
	blocks
		.filter((b) => b.slot === slot)
		.sort((a, b) => a.order - b.order)
		.map((b) => b.id);

describe('resolveMeetingFlyerLayout', () => {
	it('falls back to the default layout when there is nothing saved', () => {
		expect(resolveMeetingFlyerLayout(undefined).blocks).toEqual(MEETING_FLYER_DEFAULT_LAYOUT);
		expect(resolveMeetingFlyerLayout(null).blocks).toEqual(MEETING_FLYER_DEFAULT_LAYOUT);
		expect(resolveMeetingFlyerLayout({}).blocks).toEqual(MEETING_FLYER_DEFAULT_LAYOUT);
	});

	// No v1 branch here: this column is new, so a blocks array is always the current
	// layout version. (The retreat resolver would ignore it without layoutVersion 2.)
	it('honours a stored layout without asking for a layout version', () => {
		const resolved = resolveMeetingFlyerLayout({
			blocks: [
				{ id: 'community', slot: 'wide', order: 0, visible: true },
				{ id: 'dateTime', slot: 'right', order: 0, visible: false },
				{ id: 'location', slot: 'left', order: 0, visible: true },
			],
		});

		expect(resolved.blocks.find((b) => b.id === 'dateTime')?.slot).toBe('right');
		expect(resolved.blocks.find((b) => b.id === 'dateTime')?.visible).toBe(false);
	});

	it('re-adds a block the stored layout never heard of, at its default spot', () => {
		// A layout saved before `community` (or any future block) existed
		const resolved = resolveMeetingFlyerLayout({
			layoutVersion: 2,
			blocks: [{ id: 'dateTime', slot: 'left', order: 0, visible: true }],
		});

		expect(ids(resolved.blocks)).toEqual(ids(MEETING_FLYER_DEFAULT_LAYOUT));
		const locationQr = resolved.blocks.find((b) => b.id === 'locationQr');
		expect(locationQr?.slot).toBe('right');
		expect(locationQr?.visible).toBe(true);
	});

	it('drops unknown block ids and unknown slots', () => {
		const resolved = resolveMeetingFlyerLayout({
			layoutVersion: 2,
			blocks: [
				// 'payment' is a retreat block id, not one of this flavour's
				{ id: 'payment', slot: 'left', order: 0, visible: true },
				{ id: 'description', slot: 'nowhere', order: 0, visible: true },
			],
		} as any);

		expect(ids(resolved.blocks)).toEqual(ids(MEETING_FLYER_DEFAULT_LAYOUT));
		// description had an invalid slot, so it fell back to its default one
		expect(resolved.blocks.find((b) => b.id === 'description')?.slot).toBe('left');
	});

	it('ignores a duplicated block id, keeping the first occurrence', () => {
		const resolved = resolveMeetingFlyerLayout({
			layoutVersion: 2,
			blocks: [
				{ id: 'community', slot: 'wide', order: 0, visible: true },
				{ id: 'community', slot: 'left', order: 5, visible: false },
			],
		});

		const communities = resolved.blocks.filter((b) => b.id === 'community');
		expect(communities).toHaveLength(1);
		expect(communities[0].slot).toBe('wide');
	});

	it('renumbers order to be contiguous within each slot', () => {
		const resolved = resolveMeetingFlyerLayout({
			layoutVersion: 2,
			blocks: [
				{ id: 'description', slot: 'left', order: 40, visible: true },
				{ id: 'dateTime', slot: 'left', order: 7, visible: true },
			],
		});

		const left = resolved.blocks.filter((b) => b.slot === 'left');
		expect(left.map((b) => b.order).sort()).toEqual([...left.keys()]);
		// Relative order survives (7 < 40)
		const leftIds = inSlot(resolved.blocks, 'left');
		expect(leftIds.indexOf('dateTime')).toBeLessThan(leftIds.indexOf('description'));
	});

	describe('images', () => {
		it('leaves every image undefined when there are no overrides', () => {
			expect(resolveMeetingFlyerLayout({}).images).toEqual({
				bodyBackground: undefined,
				headerBackground: undefined,
				footerBackground: undefined,
				logo: undefined,
			});
		});

		it('keeps the overrides that are set and treats empty strings as unset', () => {
			const { images } = resolveMeetingFlyerLayout({
				images: { bodyBackground: '/jesus_bg.png', logo: '' },
			});
			expect(images.bodyBackground).toBe('/jesus_bg.png');
			expect(images.logo).toBeUndefined();
		});
	});
});

describe('moveBlockInLayout over the meeting layout', () => {
	// The generic mover is covered by the retreat suite; this pins it against this
	// flavour's default arrangement (5 blocks, community alone in wide).
	const layout = (): MeetingFlyerBlockLayout[] => resolveMeetingFlyerLayout(null).blocks;

	it('moves a block across slots keeping orders contiguous', () => {
		const moved = moveBlockInLayout(layout(), 'community', 'right', 0);

		expect(inSlot(moved, 'right')).toEqual(['community', 'location', 'locationQr']);
		expect(inSlot(moved, 'wide')).toEqual([]);
		for (const slot of ['left', 'right', 'wide']) {
			const orders = moved
				.filter((b) => b.slot === slot)
				.map((b) => b.order)
				.sort((a, b) => a - b);
			expect(orders).toEqual([...orders.keys()]);
		}
	});

	it('preserves visibility when moving', () => {
		const hidden = layout().map((b) => (b.id === 'locationQr' ? { ...b, visible: false } : b));
		const moved = moveBlockInLayout(hidden, 'locationQr', 'wide', 0);
		expect(moved.find((b) => b.id === 'locationQr')).toMatchObject({
			slot: 'wide',
			visible: false,
		});
	});
});
