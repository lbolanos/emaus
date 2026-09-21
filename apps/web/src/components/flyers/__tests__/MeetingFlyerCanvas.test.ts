import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { MeetingFlyerBlockLayout } from '@repo/types';

vi.mock('qrcode.vue', () => ({
	default: { name: 'QrcodeVue', template: '<canvas />', props: ['value', 'size'] },
}));

import MeetingFlyerCanvas from '../MeetingFlyerCanvas.vue';
import {
	MEETING_FLYER_DEFAULT_LAYOUT,
	MEETING_FLYER_PRESET_IMAGES,
} from '../meetingBlockRegistry';

const community = {
	id: 'community-1',
	name: 'buen despacho',
	address1: 'Parroquia El Señor del Buen Despacho',
	city: 'Ciudad de México',
	state: 'CDMX',
	country: 'México',
	googleMapsUrl: 'https://maps.google.com/?cid=123',
};

const meeting = {
	id: 'meeting-1',
	title: 'Convivencia de Adviento',
	description: 'Una tarde para compartir',
	startDate: '2026-12-05T18:00:00.000Z',
	durationMinutes: 120,
	isAnnouncement: false,
	flyerTemplate: '',
};

function mountCanvas(props: Record<string, unknown> = {}) {
	return mount(MeetingFlyerCanvas, {
		props: { meeting, community, ...props },
	});
}

/** Block ids in DOM order, so slot placement and ordering are both observable. */
function renderedBlocks(wrapper: ReturnType<typeof mountCanvas>): string[] {
	return wrapper.findAll('[data-flyer-block]').map((el) => el.attributes('data-flyer-block')!);
}

describe('MeetingFlyerCanvas', () => {
	it('renders every default block, left column then right then the wide row', () => {
		const wrapper = mountCanvas();
		expect(renderedBlocks(wrapper)).toEqual(
			MEETING_FLYER_DEFAULT_LAYOUT.map((b) => b.id),
		);
	});

	it('honours an explicit layout: slot, order and visibility', () => {
		const layout: MeetingFlyerBlockLayout[] = [
			{ id: 'dateTime', slot: 'left', order: 0, visible: true },
			{ id: 'description', slot: 'left', order: 1, visible: false },
			{ id: 'location', slot: 'right', order: 1, visible: true },
			{ id: 'locationQr', slot: 'right', order: 0, visible: true },
			{ id: 'community', slot: 'right', order: 2, visible: true },
		];
		const wrapper = mountCanvas({ layout });

		expect(renderedBlocks(wrapper)).toEqual(['dateTime', 'locationQr', 'location', 'community']);
	});

	describe('images', () => {
		it('falls back to the flavour presets', () => {
			const wrapper = mountCanvas();
			const html = wrapper.html();

			expect(html).toContain(MEETING_FLYER_PRESET_IMAGES.bodyBackground);
			expect(html).toContain(MEETING_FLYER_PRESET_IMAGES.headerBackground);
			expect(html).toContain(MEETING_FLYER_PRESET_IMAGES.footerBackground);
			expect(wrapper.find('img').attributes('src')).toBe(MEETING_FLYER_PRESET_IMAGES.logo);
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
			expect(html).toContain(MEETING_FLYER_PRESET_IMAGES.headerBackground);
		});
	});

	describe('content', () => {
		it('renders the header chrome: title, community name and the EMAÚS line', () => {
			const wrapper = mountCanvas();
			const text = wrapper.text();

			expect(text).toContain('Convivencia de Adviento');
			expect(text).toContain('Buen Despacho'); // display-cased
			expect(text).toContain('meetingFlyer.emausLine');
		});

		// Community names that already start with "Emaús" would stutter with the line
		it('drops the EMAÚS line for communities already carrying the name', () => {
			const wrapper = mountCanvas({ community: { ...community, name: 'emaús del valle' } });

			expect(wrapper.text()).not.toContain('meetingFlyer.emausLine');
			// titleCaseForDisplay leaves short connectives lowercase ("del")
			expect(wrapper.text()).toContain('Emaús del Valle');
		});

		it('renders the QR pointing at the community maps url', () => {
			const wrapper = mountCanvas();
			const qr = wrapper.findComponent({ name: 'QrcodeVue' });

			expect(qr.exists()).toBe(true);
			expect(qr.props('value')).toBe('https://maps.google.com/?cid=123');
		});

		it('drops a hidden text instead of falling back to its default wording', () => {
			const shown = mountCanvas();
			expect(shown.text()).toContain('meetingFlyer.kicker');

			const hidden = mountCanvas({ flyerOptions: { hiddenTexts: ['kickerOverride'] } });
			expect(hidden.text()).not.toContain('meetingFlyer.kicker');
		});

		it('keeps a custom wording on the flyer', () => {
			const wrapper = mountCanvas({ flyerOptions: { titleOverride: '¡Nos vemos!' } });

			expect(wrapper.text()).toContain('¡Nos vemos!');
		});
	});

	describe('styling', () => {
		// This flavour's defaults read straight off the artwork (the legacy Cartel
		// look): no card, clear type with a shadow — so what the Design panel calls
		// "reset" is what the unedited flyer looks like.
		it('goes boxless by default: clear text straight over the artwork', () => {
			const wrapper = mountCanvas();
			const style = wrapper.find('[data-flyer-block="dateTime"]').attributes('style') ?? '';

			expect(style).toContain('--fb-bg: transparent');
			expect(style).toContain('--fb-text: #ffffff');
			expect(style).toContain('--fb-heading: #fde68a');
			// The shadow is what keeps the clear type readable over light patches.
			expect(style).not.toContain('--fb-shadow: none');
		});

		it('keeps the QR block dark: its white plate is its own contrast', () => {
			const wrapper = mountCanvas();
			const style = wrapper.find('[data-flyer-block="locationQr"]').attributes('style') ?? '';

			expect(style).toContain('--fb-bg: transparent');
			expect(style).toContain('--fb-text: #111827');
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
				blockStyles: { dateTime: { textColor: '#111827' } },
			});

			const dateTime = wrapper.find('[data-flyer-block="dateTime"]').attributes('style') ?? '';
			const location = wrapper.find('[data-flyer-block="location"]').attributes('style') ?? '';

			expect(dateTime).toContain('--fb-text: #111827');
			expect(location).toContain('--fb-text: #ffffff');
		});

		it('washes the background image when the theme asks for it', () => {
			const plain = mountCanvas();
			const dimmed = mountCanvas({ theme: { scrim: 'dark', scrimOpacity: 50 } });

			expect(plain.html()).toContain('transparent');
			expect(dimmed.html()).toContain('rgba(0, 0, 0, 0.5)');
		});
	});

	describe('editing', () => {
		it('is not draggable unless editable, so the published flyer stays inert', () => {
			expect(
				mountCanvas().find('[data-flyer-block="dateTime"]').attributes('draggable'),
			).toBe('false');
			expect(
				mountCanvas({ editable: true }).find('[data-flyer-block="dateTime"]').attributes('draggable'),
			).toBe('true');
		});

		it('emits the move when a block is dropped on another one', async () => {
			const wrapper = mountCanvas({ editable: true });

			await wrapper.find('[data-flyer-block="community"]').trigger('dragstart');
			await wrapper.find('[data-flyer-block="dateTime"]').trigger('drop');

			expect(wrapper.emitted('moveBlock')?.[0]).toEqual(['community', 'left', 0]);
		});

		it('appends when the drop lands on the column itself', async () => {
			const wrapper = mountCanvas({ editable: true });

			await wrapper.find('[data-flyer-block="dateTime"]').trigger('dragstart');
			await wrapper.find('[data-flyer-slot="wide"]').trigger('drop');

			expect(wrapper.emitted('moveBlock')?.[0]).toEqual(['dateTime', 'wide', 1]);
		});

		it('ignores a drop with nothing being dragged', async () => {
			const wrapper = mountCanvas({ editable: true });
			await wrapper.find('[data-flyer-slot="wide"]').trigger('drop');

			expect(wrapper.emitted('moveBlock')).toBeUndefined();
		});

		it('emits the selection when a block is clicked', async () => {
			const wrapper = mountCanvas({ editable: true });
			await wrapper.find('[data-flyer-block="location"]').trigger('click');

			expect(wrapper.emitted('selectBlock')?.[0]).toEqual(['location']);
		});

		it('does not select anything when it is not editable', async () => {
			const wrapper = mountCanvas();
			await wrapper.find('[data-flyer-block="location"]').trigger('click');

			expect(wrapper.emitted('selectBlock')).toBeUndefined();
		});
	});

	it('claims the printable-area id (and print attribute) only when printable', () => {
		const published = mountCanvas();
		expect(published.find('#printable-area').exists()).toBe(true);
		expect(published.find('#printable-area').attributes('data-custom-canvas')).toBeDefined();

		// The editor's preview must not compete for the print target
		const preview = mountCanvas({ printable: false });
		expect(preview.find('#printable-area').exists()).toBe(false);
		expect(preview.find('[data-custom-canvas]').exists()).toBe(false);
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
