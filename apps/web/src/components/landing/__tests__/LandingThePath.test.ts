import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import LandingThePath from '../LandingThePath.vue';

vi.mock('lucide-vue-next', () => ({
	ChevronDown: { template: '<div data-icon="ChevronDown" />' },
	ChevronRight: { template: '<div data-icon="ChevronRight" />' },
	HeartHandshake: { template: '<div data-icon="HeartHandshake" />' },
	Sunrise: { template: '<div data-icon="Sunrise" />' },
	Users: { template: '<div data-icon="Users" />' },
}));

describe('LandingThePath', () => {
	let wrapper: VueWrapper<any>;

	beforeEach(() => {
		wrapper = mount(LandingThePath, {
			global: { mocks: { $t: (key: string) => key } },
		});
	});

	it('is the anchor target the nav links to', () => {
		expect(wrapper.find('section#the-path').exists()).toBe(true);
	});

	it('renders the three steps of the journey', () => {
		const text = wrapper.text();
		['weekend', 'team', 'after'].forEach((step) => {
			expect(text).toContain(`landing.thePath.steps.${step}.title`);
			expect(text).toContain(`landing.thePath.steps.${step}.body`);
		});
	});

	it('renders every FAQ entry as a collapsed details element', () => {
		const entries = wrapper.findAll('details');
		expect(entries).toHaveLength(6);
		entries.forEach((entry) => {
			// Collapsed by default: no `open` attribute, so the section stays short
			expect(entry.attributes('open')).toBeUndefined();
			expect(entry.find('summary').exists()).toBe(true);
		});
	});

	it('sends visitors to the retreat list', () => {
		expect(wrapper.find('a[href="#retreats"]').exists()).toBe(true);
	});
});
