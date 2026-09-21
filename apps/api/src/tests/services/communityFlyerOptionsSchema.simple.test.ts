// Guards on the community meeting-flyer design: it is a free-form JSON column
// written straight through PUT /communities/:id/flyer-options, so the schema is
// the only thing standing between a coordinator and everyone else's flyer.
// Mirrors flyerOptionsSchema.simple.test.ts for the meeting flavour.
import {
	communitySchema,
	meetingFlyerOptionsSchema,
	setCommunityFlyerOptionsSchema,
} from '@repo/types';

const V2 = {
	layoutVersion: 2,
	blocks: [
		{ id: 'dateTime', slot: 'left', order: 0, visible: true },
		{ id: 'locationQr', slot: 'right', order: 1, visible: true },
	],
	images: { bodyBackground: '/poster.png' },
};

describe('meetingFlyerOptionsSchema', () => {
	it('keeps the v2 layout fields through a parse', () => {
		const parsed = meetingFlyerOptionsSchema.parse(V2);
		expect(parsed.blocks).toHaveLength(2);
		expect(parsed.images?.bodyBackground).toBe('/poster.png');
		expect(parsed.layoutVersion).toBe(2);
	});

	it('accepts an empty object', () => {
		expect(meetingFlyerOptionsSchema.safeParse({}).success).toBe(true);
	});

	it('rejects a made-up meeting block id', () => {
		expect(
			meetingFlyerOptionsSchema.safeParse({
				blocks: [{ id: 'nope', slot: 'left', order: 0, visible: true }],
			}).success,
		).toBe(false);
	});

	// The retreat and meeting block enums are different on purpose: a stored
	// layout must never mix ids from another flyer flavour.
	it('rejects a retreat block id in the meeting layout', () => {
		expect(
			meetingFlyerOptionsSchema.safeParse({
				blocks: [{ id: 'intro', slot: 'left', order: 0, visible: true }],
			}).success,
		).toBe(false);
	});

	it('accepts per-block styles keyed by meeting block id', () => {
		const parsed = meetingFlyerOptionsSchema.parse({
			blockStyles: { locationQr: { textAlign: 'center' } },
		});
		expect(parsed.blockStyles?.locationQr?.textAlign).toBe('center');
	});

	it('rejects a retreat block id in blockStyles', () => {
		expect(
			meetingFlyerOptionsSchema.safeParse({ blockStyles: { payment: { textColor: '#000000' } } })
				.success,
		).toBe(false);
	});

	it('rejects a javascript: image', () => {
		expect(
			meetingFlyerOptionsSchema.safeParse({ images: { logo: 'javascript:alert(1)' } }).success,
		).toBe(false);
	});

	it('treats an empty image string as "use the preset"', () => {
		expect(meetingFlyerOptionsSchema.parse({ images: { logo: '' } }).images?.logo).toBeUndefined();
	});

	it('accepts a full theme with scrim', () => {
		const parsed = meetingFlyerOptionsSchema.parse({
			theme: {
				backgroundColor: '#ffffff',
				backgroundOpacity: 85,
				textColor: '#111827',
				scrim: 'dark',
				scrimOpacity: 40,
			},
		});
		expect(parsed.theme?.scrim).toBe('dark');
	});

	it('accepts the eight text overrides and hiddenTexts', () => {
		const parsed = meetingFlyerOptionsSchema.parse({
			kickerOverride: 'Nos vemos',
			titleOverride: 'Convivencia',
			dateLabelOverride: 'Cuándo',
			durationLabelOverride: 'Duración',
			descriptionLabelOverride: 'Qué haremos',
			locationLabelOverride: 'Dónde',
			qrCaptionOverride: 'Escanea',
			footerTextOverride: '¡Te esperamos!',
			hiddenTexts: ['durationLabelOverride'],
		});
		expect(parsed.titleOverride).toBe('Convivencia');
		expect(parsed.hiddenTexts).toEqual(['durationLabelOverride']);
	});

	it('rejects an invented text key in hiddenTexts', () => {
		expect(
			meetingFlyerOptionsSchema.safeParse({ hiddenTexts: ['nopeOverride'] }).success,
		).toBe(false);
	});

	it('rejects an absurd number of blocks', () => {
		const blocks = Array.from({ length: 17 }, (_, i) => ({
			id: 'dateTime',
			slot: 'left',
			order: i,
			visible: true,
		}));
		expect(meetingFlyerOptionsSchema.safeParse({ blocks }).success).toBe(false);
	});

	it('rejects a layout version beyond the latest', () => {
		expect(meetingFlyerOptionsSchema.safeParse({ layoutVersion: 3 }).success).toBe(false);
	});
});

describe('communitySchema.flyerOptions', () => {
	const base = {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Emaús del Valle',
		address1: 'Calle 1',
		city: 'CDMX',
		state: 'CDMX',
		zipCode: '00000',
		country: 'México',
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	it('accepts a community without a design (null/undefined)', () => {
		expect(communitySchema.safeParse(base).success).toBe(true);
		expect(communitySchema.safeParse({ ...base, flyerOptions: null }).success).toBe(true);
	});

	it('carries the design through a parse', () => {
		const parsed = communitySchema.parse({ ...base, flyerOptions: V2 });
		expect(parsed.flyerOptions?.blocks).toHaveLength(2);
	});
});

describe('setCommunityFlyerOptionsSchema', () => {
	const params = { id: '11111111-1111-4111-8111-111111111111' };

	it('accepts a valid body', () => {
		expect(
			setCommunityFlyerOptionsSchema.safeParse({ params, body: { flyerOptions: V2 } }).success,
		).toBe(true);
	});

	it('rejects an invalid design in the body', () => {
		expect(
			setCommunityFlyerOptionsSchema.safeParse({
				params,
				body: { flyerOptions: { blocks: [{ id: 'nope', slot: 'left', order: 0 }] } },
			}).success,
		).toBe(false);
	});

	it('rejects a non-uuid id', () => {
		expect(
			setCommunityFlyerOptionsSchema.safeParse({
				params: { id: 'not-a-uuid' },
				body: { flyerOptions: {} },
			}).success,
		).toBe(false);
	});
});
