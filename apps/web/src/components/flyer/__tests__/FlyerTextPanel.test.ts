import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import type { FlyerTextKey } from '@repo/types';
import FlyerTextPanel from '../editor/FlyerTextPanel.vue';
import { FLYER_TEXT_OVERRIDE_KEYS } from '@/stores/flyerEditorStore';
import { MEETING_FLYER_TEXT_OVERRIDE_KEYS } from '@/stores/meetingFlyerEditorStore';

function mountPanel(
	values: Record<string, string> = {},
	hiddenTexts: FlyerTextKey[] = [],
) {
	return mount(FlyerTextPanel, { props: { values, hiddenTexts } });
}

describe('FlyerTextPanel', () => {
	it('offers a field for every editable text', () => {
		const wrapper = mountPanel();

		for (const key of FLYER_TEXT_OVERRIDE_KEYS) {
			expect(wrapper.find(`#flyer-text-${key}`).exists()).toBe(true);
		}
	});

	// The long ones are quotes and notes: a single-line input hides most of what is typed
	it('gives the long texts room to breathe', () => {
		const wrapper = mountPanel();

		expect(wrapper.find('#flyer-text-encounterDescriptionOverride').element.tagName).toBe(
			'TEXTAREA',
		);
		expect(wrapper.find('#flyer-text-hopeOverride').element.tagName).toBe('INPUT');
	});

	it('shows the current override, and the default wording as the placeholder', () => {
		const wrapper = mountPanel({ hopeOverride: 'Fe y Esperanza' });
		const field = wrapper.find('#flyer-text-hopeOverride');

		expect((field.element as HTMLInputElement).value).toBe('Fe y Esperanza');
		expect(wrapper.find('#flyer-text-dareToLiveItOverride').attributes('placeholder')).toBe(
			'retreatFlyer.dareToLiveIt',
		);
	});

	it('reports what was typed', async () => {
		const wrapper = mountPanel();
		await wrapper.find('#flyer-text-hopeOverride').setValue('Fe');

		expect(wrapper.emitted('update')?.[0]).toEqual(['hopeOverride', 'Fe']);
	});

	// Hidden is a different state from empty: empty means "use the default wording",
	// hidden means the line should not be on the flyer at all. So the field goes away
	// rather than sitting there looking editable.
	it('replaces a hidden text with a note instead of a field', () => {
		const wrapper = mountPanel({}, ['catholicRetreatOverride']);

		expect(wrapper.find('#flyer-text-catholicRetreatOverride').exists()).toBe(false);
		expect(wrapper.text()).toContain('retreatFlyerEditor.texts.hiddenNote');
		expect(wrapper.find('#flyer-text-hopeOverride').exists()).toBe(true);
	});

	it('keeps a hidden text\'s override, so showing it again brings the wording back', async () => {
		const wrapper = mountPanel({ catholicRetreatOverride: 'Retiro' }, ['catholicRetreatOverride']);

		await wrapper.find('[data-text-toggle="catholicRetreatOverride"]').trigger('click');
		expect(wrapper.emitted('toggleVisibility')?.[0]).toEqual(['catholicRetreatOverride']);

		// The panel is controlled: it reports the toggle and the parent decides
		await wrapper.setProps({ hiddenTexts: [] });
		expect(
			(wrapper.find('#flyer-text-catholicRetreatOverride').element as HTMLInputElement).value,
		).toBe('Retiro');
	});

	it('has a toggle for every text, hidden or not', () => {
		const wrapper = mountPanel();
		expect(wrapper.findAll('[data-text-toggle]')).toHaveLength(FLYER_TEXT_OVERRIDE_KEYS.length);
	});

	// The panel is shared with the meeting flavour: these pin the config contract
	// (its own keys, its own default-wording prefix, per-key placeholder overrides).
	describe('meeting flavour', () => {
		const MEETING_CONFIG = {
			keys: MEETING_FLYER_TEXT_OVERRIDE_KEYS,
			multilineKeys: [],
			defaultKeys: {
				kickerOverride: 'kicker',
				dateLabelOverride: 'dateLabel',
				durationLabelOverride: 'durationLabel',
				descriptionLabelOverride: 'descriptionLabel',
				locationLabelOverride: 'locationLabel',
				qrCaptionOverride: 'qrCaption',
				footerTextOverride: 'footerText',
			},
			defaultPrefix: 'meetingFlyer',
		};

		function mountMeetingPanel(
			values: Record<string, string> = {},
			hiddenTexts: string[] = [],
		) {
			return mount(FlyerTextPanel, {
				props: {
					tPrefix: 'meetingFlyerEditor',
					config: MEETING_CONFIG,
					values,
					hiddenTexts,
					placeholderOverrides: { titleOverride: 'Convivencia de Adviento' },
				},
			});
		}

		it('offers a field for every meeting text, all single-line', () => {
			const wrapper = mountMeetingPanel();

			for (const key of MEETING_FLYER_TEXT_OVERRIDE_KEYS) {
				expect(wrapper.find(`#flyer-text-${key}`).exists()).toBe(true);
			}
			expect(wrapper.findAll('textarea')).toHaveLength(0);
		});

		it('uses the meeting wording for defaults and the live title for its override', () => {
			const wrapper = mountMeetingPanel();

			// The meeting's own title is the natural placeholder for its override
			expect(wrapper.find('#flyer-text-titleOverride').attributes('placeholder')).toBe(
				'Convivencia de Adviento',
			);
			// The rest fall back to the flavour's default wordings
			expect(wrapper.find('#flyer-text-dateLabelOverride').attributes('placeholder')).toBe(
				'meetingFlyer.dateLabel',
			);
		});

		it('replaces a hidden text with the meeting-flavoured note', () => {
			const wrapper = mountMeetingPanel({}, ['footerTextOverride']);

			expect(wrapper.find('#flyer-text-footerTextOverride').exists()).toBe(false);
			expect(wrapper.text()).toContain('meetingFlyerEditor.texts.hiddenNote');
			expect(wrapper.text()).not.toContain('retreatFlyerEditor.texts.hiddenNote');
		});
	});
});
