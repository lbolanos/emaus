import { describe, it, expect } from 'vitest';
import { resolveBlockStyle, resolveScrim, toRgba, FLYER_THEME_PRESETS } from '../flyerStyle';
import { FLYER_BLOCK_STYLE_DEFAULTS } from '@/components/flyer/blockRegistry';

describe('toRgba', () => {
	it('composes a hex colour and a percentage', () => {
		expect(toRgba('#000000', 55)).toBe('rgba(0, 0, 0, 0.55)');
		expect(toRgba('#ffffff', 100)).toBe('rgba(255, 255, 255, 1)');
		expect(toRgba('#1d4ed8', 0)).toBe('rgba(29, 78, 216, 0)');
	});

	it('clamps out-of-range opacity instead of producing invalid css', () => {
		expect(toRgba('#000000', 150)).toBe('rgba(0, 0, 0, 1)');
		expect(toRgba('#000000', -20)).toBe('rgba(0, 0, 0, 0)');
	});
});

describe('resolveBlockStyle', () => {
	it('falls back to the block defaults, with no box', () => {
		const style = resolveBlockStyle('startTime');

		expect(style.hasBox).toBe(false);
		expect(style['--fb-bg']).toBe('transparent');
		expect(style['--fb-text']).toBe(FLYER_BLOCK_STYLE_DEFAULTS.startTime.textColor);
		expect(style['--fb-heading']).toBe(FLYER_BLOCK_STYLE_DEFAULTS.startTime.headingColor);
		expect(style['--fb-radius']).toBe('0');
	});

	it('lets the theme override the defaults', () => {
		const style = resolveBlockStyle('startTime', { textColor: '#ffffff', textShadow: true });

		expect(style['--fb-text']).toBe('#ffffff');
		expect(style['--fb-shadow']).not.toBe('none');
		// Untouched fields keep the block's own default
		expect(style['--fb-heading']).toBe(FLYER_BLOCK_STYLE_DEFAULTS.startTime.headingColor);
	});

	it('lets a block override the theme', () => {
		const style = resolveBlockStyle(
			'payment',
			{ textColor: '#ffffff' },
			{ payment: { textColor: '#111827' } },
		);

		expect(style['--fb-text']).toBe('#111827');
	});

	it('only overrides the fields that are actually set', () => {
		const style = resolveBlockStyle(
			'location',
			{ textColor: '#ffffff', headingColor: '#fde68a' },
			{ location: { textColor: '#000000' } },
		);

		expect(style['--fb-text']).toBe('#000000');
		expect(style['--fb-heading']).toBe('#fde68a');
	});

	it('ignores empty strings so a cleared field falls through', () => {
		const style = resolveBlockStyle('intro', { textColor: '' as string });
		expect(style['--fb-text']).toBe(FLYER_BLOCK_STYLE_DEFAULTS.intro.textColor);
	});

	// The whole point of composing rgba in JS: using CSS opacity would fade the text
	// and its shadow along with the box.
	it('composes the box colour and opacity into a single rgba', () => {
		const style = resolveBlockStyle('intro', { backgroundColor: '#ffffff', backgroundOpacity: 80 });

		expect(style.hasBox).toBe(true);
		expect(style['--fb-bg']).toBe('rgba(255, 255, 255, 0.8)');
		expect(style['--fb-radius']).not.toBe('0');
	});

	it('treats a background without opacity as fully opaque', () => {
		expect(resolveBlockStyle('intro', { backgroundColor: '#000000' })['--fb-bg']).toBe(
			'rgba(0, 0, 0, 1)',
		);
	});

	it('falls back to the text colour when no heading colour is set anywhere', () => {
		const style = resolveBlockStyle(
			'startTime',
			{ textColor: '#123456' },
			{ startTime: { headingColor: undefined } },
		);
		// startTime does define a default heading colour, so that one still wins
		expect(style['--fb-heading']).toBe(FLYER_BLOCK_STYLE_DEFAULTS.startTime.headingColor);
		expect(style['--fb-text']).toBe('#123456');
	});

	it('gives every block the same poster palette out of the box', () => {
		// One legible palette beats per-block colours once blocks can move anywhere
		const ids = ['intro', 'startTime', 'payment', 'whatToBring'] as const;
		const texts = new Set(ids.map((id) => resolveBlockStyle(id)['--fb-text']));
		expect(texts).toEqual(new Set(['#ffffff']));
	});

	it('never leaks the theme-only fields into the block vars', () => {
		const style = resolveBlockStyle('intro', { scrim: 'dark', scrimOpacity: 60 });
		expect(Object.keys(style)).not.toContain('scrim');
		expect(style['--fb-bg']).toBe('transparent');
	});
});

describe('resolveScrim', () => {
	// Dark by default: the stock artwork is pale on top, so white text needs it
	it('dims the image by default, and only steps aside when asked', () => {
		expect(resolveScrim()).toBe('rgba(0, 0, 0, 0.35)');
		expect(resolveScrim({ scrim: 'none' })).toBe('transparent');
	});

	it('darkens or lightens with the given strength', () => {
		expect(resolveScrim({ scrim: 'dark', scrimOpacity: 40 })).toBe('rgba(0, 0, 0, 0.4)');
		expect(resolveScrim({ scrim: 'light', scrimOpacity: 25 })).toBe('rgba(255, 255, 255, 0.25)');
	});

	it('has a sensible strength when only the mode is set', () => {
		expect(resolveScrim({ scrim: 'dark' })).toBe('rgba(0, 0, 0, 0.35)');
	});
});

describe('FLYER_THEME_PRESETS', () => {
	it('offers poster, ink and veils', () => {
		expect(FLYER_THEME_PRESETS.map((p) => p.id)).toEqual(['poster', 'ink', 'veils']);
	});

	it('poster puts light text on the image with a shadow and no box', () => {
		const poster = FLYER_THEME_PRESETS.find((p) => p.id === 'poster')!.theme;
		const style = resolveBlockStyle('startTime', poster);

		expect(style.hasBox).toBe(false);
		expect(style['--fb-text']).toBe('#ffffff');
		expect(style['--fb-shadow']).not.toBe('none');
	});

	it('veils gives every block a translucent box', () => {
		const veils = FLYER_THEME_PRESETS.find((p) => p.id === 'veils')!.theme;
		const style = resolveBlockStyle('contact', veils);

		expect(style.hasBox).toBe(true);
		expect(style['--fb-bg']).toBe('rgba(255, 255, 255, 0.82)');
	});
});
