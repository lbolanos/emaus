<template>
	<div class="space-y-4">
		<p class="text-sm text-muted-foreground">{{ t(`${tPrefix}.texts.hint`) }}</p>

		<div v-for="key in config.keys" :key="key" class="space-y-1.5">
			<div class="flex items-center justify-between gap-2">
				<Label :for="`flyer-text-${key}`" class="text-xs" :class="isHidden(key) ? 'opacity-50' : ''">
					{{ t(`${tPrefix}.texts.${key}`) }}
				</Label>
				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					:aria-label="isHidden(key) ? t(`${tPrefix}.show`) : t(`${tPrefix}.hide`)"
					:title="isHidden(key) ? t(`${tPrefix}.show`) : t(`${tPrefix}.hide`)"
					:data-text-toggle="key"
					@click="emit('toggleVisibility', key)"
				>
					<component :is="isHidden(key) ? EyeOff : Eye" class="h-3.5 w-3.5" />
				</button>
			</div>

			<p v-if="isHidden(key)" class="text-[11px] text-muted-foreground">
				{{ t(`${tPrefix}.texts.hiddenNote`) }}
			</p>

			<template v-else>
				<Textarea
					v-if="config.multilineKeys.includes(key)"
					:id="`flyer-text-${key}`"
					:model-value="values[key] ?? ''"
					rows="2"
					:placeholder="placeholders[key]"
					@update:model-value="emit('update', key, String($event ?? ''))"
				/>
				<Input
					v-else
					:id="`flyer-text-${key}`"
					:model-value="values[key] ?? ''"
					:placeholder="placeholders[key]"
					@update:model-value="emit('update', key, String($event ?? ''))"
				/>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Eye, EyeOff } from 'lucide-vue-next';
import { Input, Label, Textarea } from '@repo/ui';
import { FLYER_TEXT_OVERRIDE_KEYS } from '@/stores/flyerEditorStore';
import type { FlyerTextPanelConfig } from './flyerTextConfig';

const props = withDefaults(
	defineProps<{
		values: Record<string, string>;
		hiddenTexts: string[];
		/** Which flavour's override keys and fallbacks to edit. */
		config?: FlyerTextPanelConfig;
		/** Per-key placeholders that win over the i18n default (dynamic values). */
		placeholderOverrides?: Record<string, string>;
		/** i18n prefix the editor flavour lives under (retreatFlyerEditor, meetingFlyerEditor). */
		tPrefix?: string;
	}>(),
	{
		config: () => ({
			keys: FLYER_TEXT_OVERRIDE_KEYS,
			multilineKeys: [
				'hopeQuoteOverride',
				'encounterDescriptionOverride',
				'reservationNoteOverride',
				'arrivalTimeNoteOverride',
				'scanToRegisterOverride',
			],
			defaultKeys: {
				catholicRetreatOverride: 'catholicRetreat',
				emausForOverride: 'emausFor',
				weekendOfHopeOverride: 'weekendOfHope',
				hopeOverride: 'hope',
				hopeQuoteOverride: 'hopeQuote',
				encounterDescriptionOverride: 'encounterDescription',
				dareToLiveItOverride: 'dareToLiveIt',
				arrivalTimeNoteOverride: 'arrivalTimeNote',
				whatToBringOverride: 'whatToBring',
				registerOverride: 'register',
				scanToRegisterOverride: 'scanToRegister',
				comeOverride: 'come',
				limitedCapacityOverride: 'limitedCapacity',
				dontMissItOverride: 'dontMissIt',
				reservationNoteOverride: 'reservationNote',
			},
			defaultPrefix: 'retreatFlyer',
		}),
		placeholderOverrides: () => ({}),
		tPrefix: 'retreatFlyerEditor',
	},
);

const emit = defineEmits<{
	update: [key: string, value: string];
	toggleVisibility: [key: string];
}>();

const { t } = useI18n();

const isHidden = (key: string) => props.hiddenTexts.includes(key);

/** Each override key falls back to a flavour default, shown as the placeholder. */
const placeholders = computed(() => {
	const result: Record<string, string> = {};
	for (const key of props.config.keys) {
		const override = props.placeholderOverrides[key];
		if (override !== undefined) {
			result[key] = override;
			continue;
		}
		const defaultKey = props.config.defaultKeys[key];
		result[key] = defaultKey ? t(`${props.config.defaultPrefix}.${defaultKey}`) : '';
	}
	return result;
});
</script>
