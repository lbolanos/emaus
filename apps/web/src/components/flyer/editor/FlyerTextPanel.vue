<template>
	<div class="space-y-4">
		<p class="text-sm text-muted-foreground">{{ t('retreatFlyerEditor.texts.hint') }}</p>

		<div v-for="key in FLYER_TEXT_OVERRIDE_KEYS" :key="key" class="space-y-1.5">
			<Label :for="`flyer-text-${key}`" class="text-xs">
				{{ t(`retreatFlyerEditor.texts.${key}`) }}
			</Label>
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
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input, Label, Textarea } from '@repo/ui';
import {
	FLYER_TEXT_OVERRIDE_KEYS,
	type FlyerTextOverrideKey,
} from '@/stores/flyerEditorStore';

defineProps<{
	values: Record<string, string>;
}>();

const emit = defineEmits<{
	update: [key: FlyerTextOverrideKey, value: string];
}>();

const { t } = useI18n();

const MULTILINE_KEYS: readonly string[] = [
	'hopeQuoteOverride',
	'encounterDescriptionOverride',
	'reservationNoteOverride',
];

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
