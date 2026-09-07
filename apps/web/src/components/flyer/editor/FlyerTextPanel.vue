<template>
	<div class="space-y-4">
		<p class="text-sm text-muted-foreground">{{ t('retreatFlyerEditor.texts.hint') }}</p>

		<div v-for="key in FLYER_TEXT_OVERRIDE_KEYS" :key="key" class="space-y-1.5">
			<div class="flex items-center justify-between gap-2">
				<Label :for="`flyer-text-${key}`" class="text-xs" :class="isHidden(key) ? 'opacity-50' : ''">
					{{ t(`retreatFlyerEditor.texts.${key}`) }}
				</Label>
				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					:aria-label="isHidden(key) ? t('retreatFlyerEditor.show') : t('retreatFlyerEditor.hide')"
					:title="isHidden(key) ? t('retreatFlyerEditor.show') : t('retreatFlyerEditor.hide')"
					:data-text-toggle="key"
					@click="emit('toggleVisibility', key)"
				>
					<component :is="isHidden(key) ? EyeOff : Eye" class="h-3.5 w-3.5" />
				</button>
			</div>

			<p v-if="isHidden(key)" class="text-[11px] text-muted-foreground">
				{{ t('retreatFlyerEditor.texts.hiddenNote') }}
			</p>

			<template v-else>
				<Textarea
					v-if="MULTILINE_KEYS.includes(key)"
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
import type { FlyerTextKey } from '@repo/types';
import { FLYER_TEXT_OVERRIDE_KEYS, type FlyerTextOverrideKey } from '@/stores/flyerEditorStore';

const props = defineProps<{
	values: Record<string, string>;
	hiddenTexts: FlyerTextKey[];
}>();

const emit = defineEmits<{
	update: [key: FlyerTextOverrideKey, value: string];
	toggleVisibility: [key: FlyerTextKey];
}>();

const { t } = useI18n();

const MULTILINE_KEYS: readonly string[] = [
	'hopeQuoteOverride',
	'encounterDescriptionOverride',
	'reservationNoteOverride',
	'arrivalTimeNoteOverride',
	'scanToRegisterOverride',
];

const isHidden = (key: string) => props.hiddenTexts.includes(key as FlyerTextKey);

/** Each override key falls back to a retreatFlyer.* default, shown as the placeholder. */
const DEFAULT_KEYS: Record<FlyerTextOverrideKey, string> = {
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
};

const placeholders = computed(() => {
	const result: Record<string, string> = {};
	for (const key of FLYER_TEXT_OVERRIDE_KEYS) {
		result[key] = t(`retreatFlyer.${DEFAULT_KEYS[key]}`);
	}
	return result;
});
</script>
