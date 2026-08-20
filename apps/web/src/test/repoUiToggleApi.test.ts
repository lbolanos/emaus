/**
 * Contract for the two toggles of `@repo/ui`.
 *
 * `Checkbox` and `Switch` wrap reka-ui, which only understands `modelValue` /
 * `update:modelValue`. The old radix-vue pair (`checked` / `update:checked`) is
 * silently dropped: the control renders unchecked and the handler never runs. That
 * shipped in three screens — the community member import (its "select all" did
 * nothing and row checks never painted) and the per-retreat permission switch
 * (impossible to set an override to "deny").
 *
 * The global `@repo/ui` mock in `src/test/setup.ts` accepts any prop, so no mounted
 * component test can catch this. These import the real components by path and, on
 * top of that, grep the app for the legacy spelling.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import Checkbox from '../../../../packages/ui/src/components/ui/checkbox/Checkbox.vue';
import Switch from '../../../../packages/ui/src/components/ui/switch/Switch.vue';

describe('@repo/ui Checkbox', () => {
	it('renders the state given through model-value', () => {
		expect(mount(Checkbox, { props: { modelValue: true } }).attributes('data-state')).toBe(
			'checked',
		);
		expect(mount(Checkbox, { props: { modelValue: false } }).attributes('data-state')).toBe(
			'unchecked',
		);
	});

	it('supports the indeterminate state', () => {
		const wrapper = mount(Checkbox, { props: { modelValue: 'indeterminate' } });
		expect(wrapper.attributes('data-state')).toBe('indeterminate');
	});

	it('emits update:modelValue on click', async () => {
		const wrapper = mount(Checkbox, { props: { modelValue: false } });
		await wrapper.trigger('click');
		expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
	});
});

describe('@repo/ui Switch', () => {
	it('renders the state given through model-value', () => {
		expect(mount(Switch, { props: { modelValue: true } }).attributes('data-state')).toBe(
			'checked',
		);
	});

	it('still renders the legacy checked prop', () => {
		expect(mount(Switch, { props: { checked: true } as any }).attributes('data-state')).toBe(
			'checked',
		);
	});

	it('emits each event exactly once per click', async () => {
		const wrapper = mount(Switch, { props: { modelValue: false } });
		await wrapper.trigger('click');

		// Double emission would run every consumer handler twice — a toggle would
		// flip back to where it started.
		expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
		expect(wrapper.emitted('update:checked')).toHaveLength(1);
		expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
	});
});

const collectVueFiles = (dir: string, found: string[] = []): string[] => {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) collectVueFiles(full, found);
		else if (entry.endsWith('.vue')) found.push(full);
	}
	return found;
};

describe('no legacy toggle API left in the app', () => {
	const files = collectVueFiles(resolve(__dirname, '..'));

	it('finds .vue files to scan', () => {
		expect(files.length).toBeGreaterThan(50);
	});

	it('never binds :checked or v-model:checked on Checkbox/Switch', () => {
		const offenders: string[] = [];
		for (const file of files) {
			const source = readFileSync(file, 'utf-8');
			// Only flag the shared components: plain <input type="checkbox" :checked> is fine.
			const tags = source.match(/<(Checkbox|Switch)\b[^>]*>/gs) ?? [];
			for (const tag of tags) {
				if (/(^|\s)(:checked=|v-model:checked=|@update:checked=)/.test(tag)) {
					offenders.push(`${file.split('/apps/web/')[1]} → ${tag.replace(/\s+/g, ' ').slice(0, 80)}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
