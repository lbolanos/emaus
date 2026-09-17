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
			stubs: { teleport: true, transition: true, 'router-link': true },
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
