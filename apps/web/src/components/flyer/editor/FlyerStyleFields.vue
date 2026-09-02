<template>
	<div class="space-y-3">
		<!-- Background: "none" is the poster look, the veils are just white/black shortcuts -->
		<div class="space-y-1.5">
			<Label class="text-xs">{{ t('retreatFlyerEditor.design.blockBackground') }}</Label>
			<div class="flex flex-wrap items-center gap-1.5">
				<button
					v-for="option in BACKGROUND_OPTIONS"
					:key="option.id"
					type="button"
					class="rounded border px-2 py-1 text-[11px] transition-colors"
					:class="
						activeBackground === option.id
							? 'border-primary bg-primary/10 text-foreground'
							: 'border-muted text-muted-foreground hover:text-foreground'
					"
					@click="emit('update', 'backgroundColor', option.color)"
				>
					{{ t(`retreatFlyerEditor.design.background.${option.id}`) }}
				</button>

				<label class="flex items-center gap-1" :title="t('retreatFlyerEditor.design.customColor')">
					<input
						type="color"
						class="h-7 w-9 cursor-pointer rounded border border-muted bg-transparent p-0.5"
						:value="values.backgroundColor ?? '#ffffff'"
						@input="emit('update', 'backgroundColor', ($event.target as HTMLInputElement).value)"
					/>
				</label>
			</div>

			<div v-if="values.backgroundColor" class="flex items-center gap-2">
				<span class="text-[11px] text-muted-foreground">
					{{ t('retreatFlyerEditor.design.opacity') }}
				</span>
				<input
					type="range"
					min="0"
					max="100"
					step="5"
					class="flex-1"
					:value="values.backgroundOpacity ?? 100"
					@input="
						emit('update', 'backgroundOpacity', Number(($event.target as HTMLInputElement).value))
					"
				/>
				<span class="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
					{{ values.backgroundOpacity ?? 100 }}%
				</span>
			</div>
		</div>

		<div class="flex flex-wrap gap-4">
			<div class="space-y-1">
				<Label class="text-xs">{{ t('retreatFlyerEditor.design.textColor') }}</Label>
				<div class="flex items-center gap-1">
					<button
						v-for="swatch in TEXT_SWATCHES"
						:key="swatch"
						type="button"
						class="h-6 w-6 rounded border"
						:class="values.textColor === swatch ? 'border-primary ring-2 ring-primary/40' : 'border-muted'"
						:style="{ backgroundColor: swatch }"
						:aria-label="swatch"
						@click="emit('update', 'textColor', swatch)"
					></button>
					<input
						type="color"
						class="h-6 w-8 cursor-pointer rounded border border-muted bg-transparent p-0.5"
						:value="values.textColor ?? '#111827'"
						@input="emit('update', 'textColor', ($event.target as HTMLInputElement).value)"
					/>
				</div>
			</div>

			<div class="space-y-1">
				<Label class="text-xs">{{ t('retreatFlyerEditor.design.headingColor') }}</Label>
				<div class="flex items-center gap-1">
					<button
						v-for="swatch in HEADING_SWATCHES"
						:key="swatch"
						type="button"
						class="h-6 w-6 rounded border"
						:class="values.headingColor === swatch ? 'border-primary ring-2 ring-primary/40' : 'border-muted'"
						:style="{ backgroundColor: swatch }"
						:aria-label="swatch"
						@click="emit('update', 'headingColor', swatch)"
					></button>
					<input
						type="color"
						class="h-6 w-8 cursor-pointer rounded border border-muted bg-transparent p-0.5"
						:value="values.headingColor ?? '#1d4ed8'"
						@input="emit('update', 'headingColor', ($event.target as HTMLInputElement).value)"
					/>
				</div>
			</div>
		</div>

		<label class="flex items-center gap-2 text-xs">
			<input
				type="checkbox"
				:checked="values.textShadow === true"
				@change="emit('update', 'textShadow', ($event.target as HTMLInputElement).checked)"
			/>
			{{ t('retreatFlyerEditor.design.textShadow') }}
		</label>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Label } from '@repo/ui';
import type { FlyerBlockStyle } from '@repo/types';

const props = defineProps<{
	values: FlyerBlockStyle;
}>();

const emit = defineEmits<{
	update: [key: keyof FlyerBlockStyle, value: string | number | boolean | undefined];
}>();

const { t } = useI18n();

const BACKGROUND_OPTIONS = [
	{ id: 'none', color: undefined },
	{ id: 'light', color: '#ffffff' },
	{ id: 'dark', color: '#000000' },
] as const;

const TEXT_SWATCHES = ['#ffffff', '#111827', '#1f2937', '#fde68a'];
const HEADING_SWATCHES = ['#fde68a', '#1d4ed8', '#15803d', '#ffffff'];

const activeBackground = computed(() => {
	if (!props.values.backgroundColor) return 'none';
	if (props.values.backgroundColor.toLowerCase() === '#ffffff') return 'light';
	if (props.values.backgroundColor.toLowerCase() === '#000000') return 'dark';
	return 'custom';
});
</script>
