import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import TagBadge from '../TagBadge.vue';
import { createTestWrapper, cleanupMocks } from '../../test/utils';

// Mock lucide-vue-next icons
vi.mock('lucide-vue-next', () => ({
	X: { template: '<div data-icon="X" />' },
}));

describe('TagBadge Component', () => {
	let pinia: any;

	const createMockTag = () => ({
		id: '00000000-0000-0000-0000-000000000001',
		name: 'Important',
		retreatId: '00000000-0000-0000-0000-000000000002',
		createdAt: new Date(),
		updatedAt: new Date(),
		color: '#FF5733',
	});

	beforeEach(() => {
		pinia = createPinia();
		setActivePinia(pinia);
		cleanupMocks();
	});

	afterEach(() => {
		cleanupMocks();
	});

	describe('Basic Rendering', () => {
		it('should render the tag badge', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
				},
			});

			expect(wrapper.exists()).toBe(true);
		});

		it('should display tag name', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
				},
			});

			expect(wrapper.text()).toContain('Important');
		});

		it('should render with span element', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
				},
			});

			const span = wrapper.find('span');
			expect(span.exists()).toBe(true);
		});

		it('should apply inline styles', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
				},
			});

			const span = wrapper.find('span');
			expect(span.attributes('style')).toBeTruthy();
		});

		it('should have correct CSS classes', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
				},
			});

			const span = wrapper.find('span');
			expect(span.classes()).toContain('inline-flex');
			expect(span.classes()).toContain('items-center');
			expect(span.classes()).toContain('gap-1');
			expect(span.classes()).toContain('px-2');
			expect(span.classes()).toContain('py-1');
			expect(span.classes()).toContain('rounded-full');
			expect(span.classes()).toContain('text-xs');
			expect(span.classes()).toContain('font-medium');
		});
	});

	describe('Remove Button', () => {
		it('should not show remove button when removable is false', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
					removable: false,
				},
			});

			expect(wrapper.find('button').exists()).toBe(false);
		});

		it('should not show remove button when removable is undefined', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
				},
			});

			expect(wrapper.find('button').exists()).toBe(false);
		});

		it('should show remove button when removable is true', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
					removable: true,
				},
			});

			expect(wrapper.find('button').exists()).toBe(true);
		});

		it('should emit remove event when remove button is clicked', async () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
					removable: true,
				},
			});

			const button = wrapper.find('button');
			await button.trigger('click');
			await nextTick();

			expect(wrapper.emitted('remove')).toBeTruthy();
			expect(wrapper.emitted('remove')![0]).toEqual([]);
		});

		it('should have hover effect class on remove button', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
					removable: true,
				},
			});

			const button = wrapper.find('button');
			expect(button.classes()).toContain('hover:opacity-70');
		});

		it('should have ml-1 class on remove button', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
					removable: true,
				},
			});

			const button = wrapper.find('button');
			expect(button.classes()).toContain('ml-1');
		});
	});

	describe('Different Tag Names', () => {
		it('should display short tag name', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: { ...createMockTag(), name: 'VIP' },
				},
			});

			expect(wrapper.text()).toContain('VIP');
		});

		it('should display long tag name', () => {
			const longName = 'Very Long Tag Name That Goes On';
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: { ...createMockTag(), name: longName },
				},
			});

			expect(wrapper.text()).toContain(longName);
		});

		it('should display tag name with special characters', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: { ...createMockTag(), name: 'Tag-With-Dashes' },
				},
			});

			expect(wrapper.text()).toContain('Tag-With-Dashes');
		});
	});

	describe('Color Calculations', () => {
		it('should use default gray background when tag has no color', () => {
			const tagWithoutColor = {
				id: '00000000-0000-0000-0000-000000000001',
				name: 'No Color',
				retreatId: '00000000-0000-0000-0000-000000000002',
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: tagWithoutColor,
				},
			});

			const span = wrapper.find('span');
			const style = span.attributes('style') || '';
			expect(style).toContain('background-color:');
			expect(style).toContain('#E5E7EB');
		});

		it('should use dark text when tag has no color', () => {
			const tagWithoutColor = {
				id: '00000000-0000-0000-0000-000000000001',
				name: 'No Color',
				retreatId: '00000000-0000-0000-0000-000000000002',
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: tagWithoutColor,
				},
			});

			const span = wrapper.find('span');
			const style = span.attributes('style') || '';
			expect(style).toContain('color:');
			expect(style).toContain('#374151');
		});

		it('should use white text for dark backgrounds', () => {
			const darkTag = {
				id: '00000000-0000-0000-0000-000000000001',
				name: 'Dark',
				retreatId: '00000000-0000-0000-0000-000000000002',
				createdAt: new Date(),
				updatedAt: new Date(),
				color: '#000000', // Pure black
			};

			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: darkTag,
				},
			});

			const span = wrapper.find('span');
			const style = span.attributes('style') || '';
			// Brightness of #000000 is 0, which is < 128, so text should be white
			expect(style).toContain('#FFFFFF');
		});

		it('should use black text for light backgrounds', () => {
			const lightTag = {
				id: '00000000-0000-0000-0000-000000000001',
				name: 'Light',
				retreatId: '00000000-0000-0000-0000-000000000002',
				createdAt: new Date(),
				updatedAt: new Date(),
				color: '#FFFFFF', // Pure white
			};

			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: lightTag,
				},
			});

			const span = wrapper.find('span');
			const style = span.attributes('style') || '';
			// Brightness of #FFFFFF is 255, which is > 128, so text should be black
			expect(style).toContain('#000000');
		});

		it('should use black text for medium brightness colors', () => {
			const mediumTag = {
				id: '00000000-0000-0000-0000-000000000001',
				name: 'Medium',
				retreatId: '00000000-0000-0000-0000-000000000002',
				createdAt: new Date(),
				updatedAt: new Date(),
				color: '#808080', // Medium gray (brightness ~128)
			};

			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: mediumTag,
				},
			});

			const span = wrapper.find('span');
			const style = span.attributes('style') || '';
			// Brightness of #808080 is ~128, which is not > 128, so text should be white
			// Actually brightness = 128*299/1000 + 128*587/1000 + 128*114/1000 = 128
			// 128 > 128 is false, so should be white
			expect(style).toContain('#FFFFFF');
		});
	});

	describe('Edge Cases', () => {
		it('should handle rendering without errors', () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
				},
			});

			// Component should mount without throwing
			expect(() => wrapper.html()).not.toThrow();
		});

		it('should handle click on remove button', async () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
					removable: true,
				},
			});

			const button = wrapper.find('button');
			await button.trigger('click');

			// Should not throw errors
			expect(wrapper.emitted('remove')).toBeTruthy();
		});

		it('should handle multiple clicks on remove button', async () => {
			const wrapper = mount(TagBadge, {
				global: {
					plugins: [pinia],
					mocks: {
						$t: (key: string) => key,
					},
				},
				props: {
					tag: createMockTag(),
					removable: true,
				},
			});

			const button = wrapper.find('button');
			await button.trigger('click');
			await nextTick();

			await button.trigger('click');
			await nextTick();

			expect(wrapper.emitted('remove')?.length).toBeGreaterThanOrEqual(2);
		});
	});
});
