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
