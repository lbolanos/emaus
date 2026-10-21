/**
 * The `detailFailed` prop (optional, absent = false) tells the flyer that the
 * retreat detail fetch failed and the poster is being rendered from the
 * listing data alone — the warning must only appear when the parent says so.
 *
 * Icons and the vue-i18n `t: key => key` mock come from setup.ts (all icons
 * used by this component are in its allowlist).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PublicRetreatFlyerModal from '../PublicRetreatFlyerModal.vue';

const RETREAT = {
	id: 'retreat-1',
	parish: 'Parroquia El Señor del Buen Despacho',
	startDate: '2026-10-16T18:00:00.000Z',
	cost: 850,
	contactPhones: ['5512345678'],
	house: null,
} as any;

const mountModal = (props: Record<string, unknown> = {}) =>
	mount(PublicRetreatFlyerModal, {
		props: { open: true, retreat: RETREAT, ...props },
		global: {
			// Los CTAs publicados son router-link. setup.ts pisa router-link con
			// un stub GLOBAL que pinta <a><slot /></a> sin href; un stub a nivel
			// mount LO REEMPLAZA (los stubs locales ganan a config.global.stubs),
			// así que aquí el `to` sí llega al href y el selector por destino
			// funciona.
			stubs: {
				teleport: true,
				transition: true,
				'router-link': {
					props: ['to'],
					template: '<a :href="typeof to === \'string\' ? to : \'#\'"><slot /></a>',
				},
			},
		},
	});

describe('PublicRetreatFlyerModal — detailFailed warning', () => {
	it('shows the warning when the prop is set', () => {
		const wrapper = mountModal({ detailFailed: true });

		expect(wrapper.text()).toContain('retreatFlyer.detailFailed');
	});

	it('hides the warning when the prop is absent', () => {
		const wrapper = mountModal();

		expect(wrapper.text()).not.toContain('retreatFlyer.detailFailed');
		// Sanity: the flyer itself rendered from the retreat data.
		expect(wrapper.text()).toContain(RETREAT.parish);
	});
});

describe('PublicRetreatFlyerModal — retiro anunciado (registrationOpen false)', () => {
	// Anunciado: el volante se puede ver (fechas, casa, teléfonos) pero los
	// CTAs de inscripción quedan deshabilitados con el texto "abren pronto".
	it('replaces the register CTAs with a disabled "opens soon" pill', () => {
		const wrapper = mountModal({ retreat: { ...RETREAT, registrationOpen: false } });

		expect(wrapper.text()).toContain('landing.registrationUpcoming');
		expect(wrapper.text()).not.toContain('landing.registerNow');
		expect(wrapper.findAll('a[href*="/register/"]')).toHaveLength(0);
		expect(wrapper.findAll('[aria-disabled="true"]').length).toBeGreaterThanOrEqual(2);
	});

	it('keeps the registration CTAs enabled for published retreats', () => {
		// registrationOpen ausente = legado abierto (back-compat del `=== false`).
		const wrapper = mountModal();

		expect(wrapper.text()).toContain('landing.registerNow');
		expect(wrapper.text()).not.toContain('landing.registrationUpcoming');
		expect(wrapper.findAll('a[href*="/register/walker/"]').length).toBe(1);
	});
});

