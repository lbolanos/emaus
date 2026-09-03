import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { FlyerBlockLayout } from '@repo/types';

vi.mock('qrcode.vue', () => ({
	default: { name: 'QrcodeVue', template: '<canvas />', props: ['value', 'size'] },
}));

import RetreatFlyerCanvas from '../RetreatFlyerCanvas.vue';
import { FLYER_DEFAULT_LAYOUT, FLYER_PRESET_IMAGES } from '../blockRegistry';

const retreat = {
	id: 'r1',
	parish: 'San Judas Tadeo',
	retreat_type: 'men',
	retreat_number_version: 'III',
	startDate: '2026-04-17',
	endDate: '2026-04-19',
	walkerArrivalTime: '17:00',
	cost: '2700',
	thingsToBringNotes: 'Termo\nToalla',
	contactPhones: 'HORACIO: 55 60219193',
	house: {
		name: 'Casa de los Teatinos',
		address1: 'Km. 9.5 Carr. Tlalnepantla-Progreso',
		city: 'Ciudad López Mateos',
		googleMapsUrl: 'https://maps.google.com/?cid=123',
	},
};

function mountCanvas(props: Record<string, unknown> = {}) {
	return mount(RetreatFlyerCanvas, {
		props: { retreat, ...props },
	});
}

/** Block ids in DOM order, so slot placement and ordering are both observable. */
function renderedBlocks(wrapper: ReturnType<typeof mountCanvas>): string[] {
	return wrapper.findAll('[data-flyer-block]').map((el) => el.attributes('data-flyer-block')!);
}

describe('RetreatFlyerCanvas', () => {
	it('renders every default block', () => {
		const wrapper = mountCanvas();
		expect(renderedBlocks(wrapper).sort()).toEqual(FLYER_DEFAULT_LAYOUT.map((b) => b.id).sort());
	});

	it('renders blocks in slot order: left column, then right column, then the wide row', () => {
		const wrapper = mountCanvas();
		expect(renderedBlocks(wrapper)).toEqual([
			'intro',
			'startTime',
			'location',
			'endTime',
			'registrationQr',
			'contact',
			'payment',
			'whatToBring',
		]);
	});

	it('honours an explicit layout: slot, order and visibility', () => {
		const layout: FlyerBlockLayout[] = [
			{ id: 'payment', slot: 'left', order: 1, visible: true },
			{ id: 'intro', slot: 'left', order: 0, visible: true },
			{ id: 'contact', slot: 'right', order: 0, visible: true },
			{ id: 'whatToBring', slot: 'wide', order: 0, visible: true },
			{ id: 'startTime', slot: 'left', order: 2, visible: false },
		];
		const wrapper = mountCanvas({ layout });

		expect(renderedBlocks(wrapper)).toEqual([
			'intro',
			'payment',
			'contact',
			'whatToBring',
		]);
	});

	it('drops the registration QR when the legacy showQrCodesRegistration flag is off', () => {
		const wrapper = mountCanvas({ flyerOptions: { showQrCodesRegistration: false } });
		expect(renderedBlocks(wrapper)).not.toContain('registrationQr');
		expect(renderedBlocks(wrapper)).toContain('contact');
	});

	it('drops the registration QR when the legacy showQrCodes flag is off', () => {
		const wrapper = mountCanvas({ flyerOptions: { showQrCodes: false } });
		expect(renderedBlocks(wrapper)).not.toContain('registrationQr');
	});

	it('falls back to the preset images and the retreat-type logo', () => {
		const wrapper = mountCanvas();
		const html = wrapper.html();

		expect(html).toContain(FLYER_PRESET_IMAGES.headerBackground);
		expect(html).toContain(FLYER_PRESET_IMAGES.footerBackground);
		expect(html).toContain(FLYER_PRESET_IMAGES.bodyBackground);
		expect(wrapper.find('img').attributes('src')).toBe('/oficial_mejorado.png');
	});

	it('uses image overrides when given, per key', () => {
		const wrapper = mountCanvas({
			imageOverrides: {
				bodyBackground: 'https://cdn.example.com/body.webp',
				logo: 'https://cdn.example.com/logo.webp',
			},
		});
		const html = wrapper.html();

		expect(html).toContain('https://cdn.example.com/body.webp');
		expect(wrapper.find('img').attributes('src')).toBe('https://cdn.example.com/logo.webp');
		// Untouched keys keep their presets
		expect(html).toContain(FLYER_PRESET_IMAGES.headerBackground);
	});

	it('renders nothing for the contact block when the retreat has no contacts', () => {
		const wrapper = mount(RetreatFlyerCanvas, {
			props: { retreat: { ...retreat, contactPhones: '' } },
		});
		expect(wrapper.text()).not.toContain('retreatFlyer.information');
	});

	describe('styling', () => {
		it('paints no box by default, so the artwork shows through', () => {
			const wrapper = mountCanvas();
			const style = wrapper.find('[data-flyer-block="intro"]').attributes('style') ?? '';

			expect(style).toContain('--fb-bg: transparent');
			expect(style).toContain('--fb-radius: 0');
		});

		it('applies the theme colours to every block', () => {
			const wrapper = mountCanvas({ theme: { textColor: '#ffffff', textShadow: true } });
			const style = wrapper.find('[data-flyer-block="location"]').attributes('style') ?? '';

			expect(style).toContain('--fb-text: #ffffff');
			expect(style).not.toContain('--fb-shadow: none');
		});

		it('lets a single block override the theme', () => {
			const wrapper = mountCanvas({
				theme: { textColor: '#ffffff' },
				blockStyles: { payment: { textColor: '#111827', backgroundColor: '#ffffff', backgroundOpacity: 50 } },
			});

			const payment = wrapper.find('[data-flyer-block="payment"]').attributes('style') ?? '';
			const contact = wrapper.find('[data-flyer-block="contact"]').attributes('style') ?? '';

			expect(payment).toContain('--fb-text: #111827');
			expect(payment).toContain('rgba(255, 255, 255, 0.5)');
			expect(contact).toContain('--fb-text: #ffffff');
		});

		// The reflow that centring and right-aligning need is a selector, not a value:
		// stacking the icon row cannot be expressed as a CSS variable.
		it('carries the alignment as both a variable and an attribute', () => {
			const wrapper = mountCanvas({ blockStyles: { startTime: { textAlign: 'center' } } });
			const block = wrapper.find('[data-flyer-block="startTime"]');

			expect(block.attributes('style')).toContain('--fb-align: center');
			expect(block.attributes('style')).toContain('--fb-justify: center');
			expect(block.attributes('data-align')).toBe('center');
		});

		it('hangs contact off the right by default, and lets that be changed', () => {
			expect(
				mountCanvas().find('[data-flyer-block="contact"]').attributes('data-align'),
			).toBe('right');

			expect(
				mountCanvas({ blockStyles: { contact: { textAlign: 'left' } } })
					.find('[data-flyer-block="contact"]')
					.attributes('data-align'),
			).toBe('left');
		});

		// The rows are marked so the icons and bullets travel with the text
		it('marks the rows the alignment has to move', () => {
			const wrapper = mountCanvas();

			expect(wrapper.find('[data-flyer-block="startTime"] .fb-lead').exists()).toBe(true);
			expect(wrapper.find('[data-flyer-block="contact"] .fb-lead').exists()).toBe(true);
			expect(wrapper.find('[data-flyer-block="contact"] .fb-box').exists()).toBe(true);
			expect(wrapper.find('[data-flyer-block="payment"] .fb-box').exists()).toBe(true);
		});

		// As a block it stretched across the column: a white bar with the address stranded
		// at one end. happy-dom has no layout, so this fixes the class that does it.
		it('sizes the address plate to the address', () => {
			const plate = mountCanvas().find('[data-registration-domain]');

			expect(plate.classes()).toContain('inline-block');
			expect(plate.classes()).toContain('max-w-full');
		});

		it('washes the background image when the theme asks for it', () => {
			const plain = mountCanvas();
			const dimmed = mountCanvas({ theme: { scrim: 'dark', scrimOpacity: 50 } });

			expect(plain.html()).toContain('transparent');
			expect(dimmed.html()).toContain('rgba(0, 0, 0, 0.5)');
		});
	});

	describe('hidden texts', () => {
		// Hiding is not the same as leaving an override empty: empty means "use the
		// default wording", hidden means the line should not be on the flyer at all.
		it('drops a hidden text from the flyer instead of falling back to the default', () => {
			const shown = mountCanvas();
			expect(shown.text()).toContain('retreatFlyer.catholicRetreat');

			const hidden = mountCanvas({ flyerOptions: { hiddenTexts: ['catholicRetreatOverride'] } });
			expect(hidden.text()).not.toContain('retreatFlyer.catholicRetreat');
		});

		it('hides the call to action without touching the intro copy', () => {
			const wrapper = mountCanvas({ flyerOptions: { hiddenTexts: ['dareToLiveItOverride'] } });

			expect(wrapper.text()).not.toContain('retreatFlyer.dareToLiveIt');
			expect(wrapper.text()).toContain('retreatFlyer.encounterDescription');
		});

		it('can strip the header down to nothing but the parish', () => {
			const wrapper = mountCanvas({
				flyerOptions: {
					hiddenTexts: ['hopeOverride', 'weekendOfHopeOverride', 'hopeQuoteOverride'],
				},
			});

			expect(wrapper.find('#flyer-title').exists()).toBe(false);
			expect(wrapper.text()).not.toContain('retreatFlyer.hopeQuote');
			expect(wrapper.text()).toContain('San Judas Tadeo');
		});

		it('keeps a custom text when it is not in the hidden list', () => {
			const wrapper = mountCanvas({
				flyerOptions: { comeOverride: 'Anímate', hiddenTexts: ['dontMissItOverride'] },
			});

			expect(wrapper.text()).toContain('Anímate');
			expect(wrapper.text()).not.toContain('retreatFlyer.dontMissIt');
		});
	});

	describe('editing', () => {
		it('is not draggable unless editable, so the published flyer stays inert', () => {
			// draggable="false" is how HTML spells "not draggable"
			expect(
				mountCanvas().find('[data-flyer-block="intro"]').attributes('draggable'),
			).toBe('false');
			expect(
				mountCanvas({ editable: true }).find('[data-flyer-block="intro"]').attributes('draggable'),
			).toBe('true');
		});

		it('emits the move when a block is dropped on another one', async () => {
			const wrapper = mountCanvas({ editable: true });

			await wrapper.find('[data-flyer-block="whatToBring"]').trigger('dragstart');
			await wrapper.find('[data-flyer-block="intro"]').trigger('drop');

			expect(wrapper.emitted('moveBlock')?.[0]).toEqual(['whatToBring', 'left', 0]);
		});

		it('appends when the drop lands on the column itself', async () => {
			const wrapper = mountCanvas({ editable: true });

			await wrapper.find('[data-flyer-block="intro"]').trigger('dragstart');
			await wrapper.find('[data-flyer-slot="wide"]').trigger('drop');

			expect(wrapper.emitted('moveBlock')?.[0]).toEqual(['intro', 'wide', 1]);
		});

		it('ignores a drop with nothing being dragged', async () => {
			const wrapper = mountCanvas({ editable: true });
			await wrapper.find('[data-flyer-slot="wide"]').trigger('drop');

			expect(wrapper.emitted('moveBlock')).toBeUndefined();
		});

		it('emits the selection when a block is clicked', async () => {
			const wrapper = mountCanvas({ editable: true });
			await wrapper.find('[data-flyer-block="contact"]').trigger('click');

			expect(wrapper.emitted('selectBlock')?.[0]).toEqual(['contact']);
		});

		it('does not select anything when it is not editable', async () => {
			const wrapper = mountCanvas();
			await wrapper.find('[data-flyer-block="contact"]').trigger('click');

			expect(wrapper.emitted('selectBlock')).toBeUndefined();
		});
	});

	it('keeps the printable-area id so print, copy and PDF export keep working', () => {
		const wrapper = mountCanvas();
		expect(wrapper.find('#printable-area').exists()).toBe(true);
	});

	it('applies the mobile downscale only below 1', () => {
		expect(mountCanvas({ scale: 1 }).find('#printable-area').attributes('style')).not.toContain(
			'scale',
		);
		expect(mountCanvas({ scale: 0.5 }).find('#printable-area').attributes('style')).toContain(
			'scale(0.5)',
		);
	});
});
