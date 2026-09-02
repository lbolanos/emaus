// Guards on the flyer_options schema: it is a free-form JSON column written straight
// through PUT /retreats/:id, so the schema is the only thing standing between a
// coordinator and everyone else's flyer.
import { flyerOptionsSchema, flyerTemplateSchema } from '@repo/types';

const V2 = {
	layoutVersion: 2,
	blocks: [{ id: 'intro', slot: 'left', order: 0, visible: true }],
	images: { bodyBackground: '/jesus2.png' },
};

describe('flyerOptionsSchema', () => {
	describe('backwards compatibility', () => {
		it('accepts a v1 row with only text overrides', () => {
			const parsed = flyerOptionsSchema.parse({
				titleOverride: '',
				hopeOverride: 'Encuentro',
				showQrCodes: true,
				showPickupInfo: false,
			});

			expect(parsed.hopeOverride).toBe('Encuentro');
			expect(parsed.showPickupInfo).toBe(false);
			expect(parsed.layoutVersion).toBeUndefined();
		});

		it('accepts an empty object, filling in the defaults', () => {
			const parsed = flyerOptionsSchema.parse({});
			expect(parsed.showQrCodesLocation).toBe(true);
			expect(parsed.showQrCodesRegistration).toBe(true);
		});

		// z.object() drops undeclared keys silently, which is how a field survives or
		// vanishes on save. This is the check that catches a forgotten declaration.
		it('keeps the v2 layout fields through a parse', () => {
			const parsed = flyerOptionsSchema.parse(V2);
			expect(parsed.blocks).toHaveLength(1);
			expect(parsed.images?.bodyBackground).toBe('/jesus2.png');
			expect(parsed.layoutVersion).toBe(2);
		});
	});

	describe('images', () => {
		it.each([
			['an app preset', '/jesus2.png'],
			['an https URL', 'https://bucket.s3.us-east-2.amazonaws.com/public-assets/x.webp'],
			['an inline data URI', 'data:image/webp;base64,UklGRg=='],
		])('accepts %s', (_label, url) => {
			expect(flyerOptionsSchema.parse({ images: { logo: url } }).images?.logo).toBe(url);
		});

		it('treats an empty string as "use the preset" instead of failing', () => {
			// The client clears an image by sending ''; a 400 here is the recurring bug
			expect(flyerOptionsSchema.parse({ images: { logo: '' } }).images?.logo).toBeUndefined();
		});

		it.each([
			['javascript:', 'javascript:alert(1)'],
			['plain http', 'http://example.com/x.png'],
			['a non-image data URI', 'data:text/html;base64,PHNjcmlwdD4='],
			['a quote that would break out of url()', "https://x/y.png');background:red;//"],
		])('rejects %s', (_label, url) => {
			expect(flyerOptionsSchema.safeParse({ images: { logo: url } }).success).toBe(false);
		});

		it('rejects an image string beyond the inline bound', () => {
			const huge = `data:image/webp;base64,${'A'.repeat(1_000_001)}`;
			expect(flyerOptionsSchema.safeParse({ images: { logo: huge } }).success).toBe(false);
		});
	});

	describe('theme and block styles', () => {
		it('accepts a full theme', () => {
			const parsed = flyerOptionsSchema.parse({
				theme: {
					backgroundColor: '#ffffff',
					backgroundOpacity: 80,
					textColor: '#111827',
					headingColor: '#1d4ed8',
					textShadow: true,
					scrim: 'dark',
					scrimOpacity: 40,
				},
			});
			expect(parsed.theme?.scrim).toBe('dark');
		});

		it('accepts per-block overrides keyed by block id', () => {
			const parsed = flyerOptionsSchema.parse({
				blockStyles: { payment: { textColor: '#000000' } },
			});
			expect(parsed.blockStyles?.payment?.textColor).toBe('#000000');
		});

		it('rejects a made-up block id', () => {
			expect(
				flyerOptionsSchema.safeParse({ blockStyles: { nope: { textColor: '#000000' } } }).success,
			).toBe(false);
		});

		it.each([
			['a colour name', 'red'],
			['a short hex', '#fff'],
			['a colour with alpha', '#ffffffcc'],
			['something that is not a colour', 'url(evil)'],
		])('rejects %s', (_label, colour) => {
			expect(flyerOptionsSchema.safeParse({ theme: { textColor: colour } }).success).toBe(false);
		});

		it('rejects an opacity outside 0-100', () => {
			expect(flyerOptionsSchema.safeParse({ theme: { backgroundOpacity: 120 } }).success).toBe(
				false,
			);
			expect(flyerOptionsSchema.safeParse({ theme: { scrimOpacity: -5 } }).success).toBe(false);
		});

		it('rejects an invented scrim mode', () => {
			expect(flyerOptionsSchema.safeParse({ theme: { scrim: 'rainbow' } }).success).toBe(false);
		});
	});

	describe('bounds', () => {
		it('rejects an absurd number of blocks', () => {
			const blocks = Array.from({ length: 500 }, () => ({
				id: 'intro',
				slot: 'left',
				order: 0,
				visible: true,
			}));
			expect(flyerOptionsSchema.safeParse({ blocks }).success).toBe(false);
		});

		it('rejects an unknown block id or slot', () => {
			expect(
				flyerOptionsSchema.safeParse({
					blocks: [{ id: 'nope', slot: 'left', order: 0, visible: true }],
				}).success,
			).toBe(false);
			expect(
				flyerOptionsSchema.safeParse({
					blocks: [{ id: 'intro', slot: 'nowhere', order: 0, visible: true }],
				}).success,
			).toBe(false);
		});

		it('rejects a novel pasted into a text override', () => {
			expect(
				flyerOptionsSchema.safeParse({ hopeOverride: 'x'.repeat(2001) }).success,
			).toBe(false);
		});

		it('still accepts a long-but-reasonable description', () => {
			expect(
				flyerOptionsSchema.safeParse({ encounterDescriptionOverride: 'x'.repeat(1500) }).success,
			).toBe(true);
		});
	});
});

describe('flyerTemplateSchema', () => {
	const base = {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Diseño',
		layout: V2,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	it('accepts both scopes', () => {
		expect(flyerTemplateSchema.safeParse({ ...base, scope: 'personal' }).success).toBe(true);
		expect(
			flyerTemplateSchema.safeParse({
				...base,
				scope: 'community',
				communityId: '22222222-2222-4222-8222-222222222222',
			}).success,
		).toBe(true);
	});

	it('rejects an invented scope', () => {
		expect(flyerTemplateSchema.safeParse({ ...base, scope: 'global' }).success).toBe(false);
	});

	it('requires a name', () => {
		expect(flyerTemplateSchema.safeParse({ ...base, scope: 'personal', name: '  ' }).success).toBe(
			false,
		);
	});
});
