import { describe, it, expect } from 'vitest';
import {
	resolveBlockStyle,
	resolveScrim,
	toRgba,
	contrastRatio,
	checkBlockContrast,
	themeForBackground,
	FLYER_THEME_PRESETS,
} from '../flyerStyle';
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

	// A missing field cannot clear an inherited one, so "no box" on a block that
	// defaults to having one has to be said with an explicit zero.
	it('lets an opacity of zero switch off a box inherited from below', () => {
		const themed = { backgroundColor: '#ffffff', backgroundOpacity: 65 };
		expect(resolveBlockStyle('payment', themed).hasBox).toBe(true);

		const off = resolveBlockStyle('payment', themed, { payment: { backgroundOpacity: 0 } });
		expect(off.hasBox).toBe(false);
		expect(off['--fb-bg']).toBe('transparent');
		expect(off['--fb-radius']).toBe('0');
	});

	it('lets a block switch off a box coming from the theme', () => {
		const off = resolveBlockStyle(
			'intro',
			{ backgroundColor: '#ffffff', backgroundOpacity: 80 },
			{ intro: { backgroundOpacity: 0 } },
		);
		expect(off.hasBox).toBe(false);
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

	it('keeps the original flyer colours per block', () => {
		// Blue for the times, green for the venue, light text where the artwork darkens
		expect(resolveBlockStyle('startTime')['--fb-heading']).toBe('#1d4ed8');
		expect(resolveBlockStyle('location')['--fb-heading']).toBe('#15803d');
		expect(resolveBlockStyle('endTime')['--fb-text']).toBe('#ffffff');
		expect(resolveBlockStyle('whatToBring')['--fb-text']).toBe('#f3f4f6');
	});

	// No block ships with a box: otherwise the design panel would say "no background"
	// while the flyer clearly showed one, which is what a coordinator reads as a bug.
	it('ships every block without a box', () => {
		const ids = ['intro', 'startTime', 'location', 'endTime', 'contact', 'payment'] as const;
		for (const id of ids) {
			expect(resolveBlockStyle(id).hasBox).toBe(false);
			expect(resolveBlockStyle(id)['--fb-bg']).toBe('transparent');
		}
	});

	// The alignment moves the icons and the capped boxes too, so it resolves into
	// three things at once: the text-align, a justify-content and a pair of margins.
	it('keeps the alignment each block had in the original flyer', () => {
		expect(resolveBlockStyle('contact')['--fb-align']).toBe('right');
		expect(resolveBlockStyle('intro')['--fb-align']).toBe('center');
		expect(resolveBlockStyle('payment')['--fb-align']).toBe('center');
		expect(resolveBlockStyle('startTime')['--fb-align']).toBe('left');
	});

	it('turns the alignment into the flex and margin values the blocks need', () => {
		const centred = resolveBlockStyle('startTime', undefined, { startTime: { textAlign: 'center' } });
		expect(centred['--fb-justify']).toBe('center');
		expect([centred['--fb-box-ml'], centred['--fb-box-mr']]).toEqual(['auto', 'auto']);

		const right = resolveBlockStyle('startTime', undefined, { startTime: { textAlign: 'right' } });
		expect(right['--fb-justify']).toBe('flex-end');
		expect([right['--fb-box-ml'], right['--fb-box-mr']]).toEqual(['auto', '0']);

		const left = resolveBlockStyle('contact', undefined, { contact: { textAlign: 'left' } });
		expect(left['--fb-justify']).toBe('flex-start');
		expect([left['--fb-box-ml'], left['--fb-box-mr']]).toEqual(['0', 'auto']);
	});

	it('lets the theme align every block, and a block still overrule it', () => {
		expect(resolveBlockStyle('startTime', { textAlign: 'center' })['--fb-align']).toBe('center');
		expect(
			resolveBlockStyle('startTime', { textAlign: 'center' }, { startTime: { textAlign: 'right' } })[
				'--fb-align'
			],
		).toBe('right');
	});

	it('never leaks the theme-only fields into the block vars', () => {
		const style = resolveBlockStyle('intro', { scrim: 'dark', scrimOpacity: 60 });
		expect(Object.keys(style)).not.toContain('scrim');
		expect(style['--fb-bg']).toBe('transparent');
	});
});

describe('resolveScrim', () => {
	// Off by default, like the original flyer: the block colours assume the artwork as-is
	it('leaves the image alone by default', () => {
		expect(resolveScrim()).toBe('transparent');
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

describe('contrastRatio', () => {
	it('is 21 for black on white and 1 for a colour on itself', () => {
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
		expect(contrastRatio('#1d4ed8', '#1d4ed8')).toBeCloseTo(1, 5);
	});

	it('does not care which colour is the text', () => {
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(
			contrastRatio('#ffffff', '#000000'),
			5,
		);
	});
});

describe('checkBlockContrast', () => {
	it('passes the stock design', () => {
		expect(checkBlockContrast('startTime').isPoor).toBe(false);
		expect(checkBlockContrast('endTime').isPoor).toBe(false);
	});

	// The trap this exists for: a dark veil under text that stayed dark
	it('flags dark text on a dark veil', () => {
		const check = checkBlockContrast(
			'payment',
			{ textColor: '#1f2937' },
			{ payment: { backgroundColor: '#000000', backgroundOpacity: 90 } },
		);
		expect(check.isPoor).toBe(true);
	});

	it('flags white text on a white veil', () => {
		const check = checkBlockContrast('intro', {
			textColor: '#ffffff',
			backgroundColor: '#ffffff',
			backgroundOpacity: 95,
		});
		expect(check.isPoor).toBe(true);
	});

	it('is happy once the text colour is flipped', () => {
		const check = checkBlockContrast(
			'payment',
			{ textColor: '#ffffff' },
			{ payment: { backgroundColor: '#000000', backgroundOpacity: 90 } },
		);
		expect(check.isPoor).toBe(false);
	});
});

describe('themeForBackground', () => {
	it('goes light over a dark picture', () => {
		const theme = themeForBackground(0.15);
		expect(theme.textColor).toBe('#ffffff');
		expect(theme.textShadow).toBe(true);
		expect(theme.scrim).toBe('dark');
	});

	it('goes dark over a pale picture', () => {
		const theme = themeForBackground(0.85);
		expect(theme.textColor).toBe('#1f2937');
		expect(theme.scrim).toBe('light');
	});

	it('produces a readable palette either way', () => {
		for (const brightness of [0.1, 0.5, 0.9]) {
			const theme = themeForBackground(brightness);
			expect(checkBlockContrast('startTime', theme).isPoor).toBe(false);
		}
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
