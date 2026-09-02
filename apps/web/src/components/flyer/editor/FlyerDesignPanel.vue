<template>
	<div class="space-y-5">
		<!-- Presets: one click to a coherent look -->
		<div class="space-y-2">
			<Label class="text-xs">{{ t('retreatFlyerEditor.design.presets') }}</Label>
			<div class="flex flex-wrap gap-1.5">
				<Button
					v-for="preset in FLYER_THEME_PRESETS"
					:key="preset.id"
					type="button"
					size="sm"
					variant="outline"
					@click="emit('applyPreset', preset.theme)"
				>
					{{ t(`retreatFlyerEditor.design.preset.${preset.id}`) }}
				</Button>
				<!-- "Original" is not a preset, it is an empty theme -->
				<Button type="button" size="sm" variant="ghost" @click="emit('clearTheme')">
					{{ t('retreatFlyerEditor.design.preset.original') }}
				</Button>
			</div>

			<!-- Saves fixing eight blocks by hand after swapping the background image -->
			<Button
				type="button"
				size="sm"
				variant="outline"
				class="w-full"
				:disabled="matching"
				@click="matchBackground"
			>
				<Loader2 v-if="matching" class="mr-1.5 h-4 w-4 animate-spin" />
				<Wand2 v-else class="mr-1.5 h-4 w-4" />
				{{ t('retreatFlyerEditor.design.matchBackground') }}
			</Button>
			<p v-if="matchError" class="text-[11px] text-destructive">{{ matchError }}</p>
		</div>

		<!-- Whole-flyer palette -->
		<div class="space-y-3 rounded-lg border p-3">
			<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{{ t('retreatFlyerEditor.design.wholeFlyer') }}
			</p>

			<FlyerStyleFields :values="theme" @update="(key, value) => emit('updateTheme', key, value)" />

			<div class="space-y-1.5 border-t pt-3">
				<Label class="text-xs">{{ t('retreatFlyerEditor.design.scrim') }}</Label>
				<p class="text-[11px] text-muted-foreground">
					{{ t('retreatFlyerEditor.design.scrimHint') }}
				</p>
				<div class="flex flex-wrap items-center gap-1.5">
					<button
						v-for="mode in (['none', 'dark', 'light'] as const)"
						:key="mode"
						type="button"
						class="rounded border px-2 py-1 text-[11px] transition-colors"
						:class="
							(theme.scrim ?? 'none') === mode
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-muted text-muted-foreground hover:text-foreground'
						"
						@click="emit('updateTheme', 'scrim', mode)"
					>
						{{ t(`retreatFlyerEditor.design.scrimMode.${mode}`) }}
					</button>
				</div>
				<div v-if="(theme.scrim ?? 'none') !== 'none'" class="flex items-center gap-2">
					<input
						type="range"
						min="0"
						max="100"
						step="5"
						class="flex-1"
						:value="theme.scrimOpacity ?? 35"
						@input="
							emit('updateTheme', 'scrimOpacity', Number(($event.target as HTMLInputElement).value))
						"
					/>
					<span class="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
						{{ theme.scrimOpacity ?? 35 }}%
					</span>
				</div>
			</div>
		</div>

		<!-- Blocks: visibility, and click to style one -->
		<div class="space-y-2">
			<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{{ t('retreatFlyerEditor.design.blocks') }}
			</p>
			<p class="text-[11px] text-muted-foreground">{{ t('retreatFlyerEditor.dragHint') }}</p>

			<ul class="space-y-1">
				<li
					v-for="block in orderedBlocks"
					:key="block.id"
					class="flex items-center gap-2 rounded-md border px-2 py-1.5"
					:class="[
						block.visible === false ? 'opacity-50' : '',
						selectedBlockId === block.id ? 'border-primary bg-primary/5' : '',
					]"
					:data-block="block.id"
				>
					<button
						type="button"
						class="flex-1 truncate text-left text-sm"
						@click="emit('selectBlock', block.id)"
					>
						{{ t(`retreatFlyerEditor.blocks.${block.id}`) }}
					</button>
					<span
						v-if="block.visible === false"
						class="text-[10px] uppercase text-muted-foreground"
					>
						{{ t('retreatFlyerEditor.hidden') }}
					</span>
					<AlertTriangle
						v-else-if="poorContrast.has(block.id)"
						class="h-3.5 w-3.5 flex-shrink-0 text-amber-500"
						:aria-label="t('retreatFlyerEditor.design.lowContrast')"
					>
						<title>{{ t('retreatFlyerEditor.design.lowContrast') }}</title>
					</AlertTriangle>
					<button
						type="button"
						class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
						:aria-label="
							block.visible === false ? t('retreatFlyerEditor.show') : t('retreatFlyerEditor.hide')
						"
						@click="emit('toggleVisibility', block.id)"
					>
						<component :is="block.visible === false ? EyeOff : Eye" class="h-4 w-4" />
					</button>
				</li>
			</ul>
		</div>

		<!-- Selected block's own style -->
		<div v-if="selectedBlockId" class="space-y-3 rounded-lg border border-primary/40 p-3">
			<div class="flex items-center justify-between gap-2">
				<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{{ t(`retreatFlyerEditor.blocks.${selectedBlockId}`) }}
				</p>
				<Button type="button" size="sm" variant="ghost" @click="emit('clearBlockStyle', selectedBlockId)">
					{{ t('retreatFlyerEditor.design.reset') }}
				</Button>
			</div>
			<p
				v-if="poorContrast.has(selectedBlockId)"
				class="flex items-start gap-1.5 text-[11px] text-amber-600"
			>
				<AlertTriangle class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
				{{ t('retreatFlyerEditor.design.lowContrastHint') }}
			</p>
			<FlyerStyleFields
				:values="blockStyles[selectedBlockId] ?? {}"
				@update="(key, value) => emit('updateBlockStyle', selectedBlockId!, key, value)"
			/>
		</div>
		<p v-else class="text-[11px] text-muted-foreground">
			{{ t('retreatFlyerEditor.design.selectHint') }}
		</p>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertTriangle, Eye, EyeOff, Loader2, Wand2 } from 'lucide-vue-next';
import { Button, Label } from '@repo/ui';
import type { FlyerBlockId, FlyerBlockLayout, FlyerBlockStyle, FlyerTheme } from '@repo/types';
import { FLYER_THEME_PRESETS, checkBlockContrast, themeForBackground } from '@/utils/flyerStyle';
import { averageImageLuminance } from '@/utils/imageLuminance';
import { FLYER_SLOTS } from '../blockRegistry';
import FlyerStyleFields from './FlyerStyleFields.vue';

const props = defineProps<{
	blocks: FlyerBlockLayout[];
	theme: FlyerTheme;
	blockStyles: Partial<Record<FlyerBlockId, FlyerBlockStyle>>;
	selectedBlockId: FlyerBlockId | null;
	/** The artwork currently behind the blocks, to match a palette to it. */
	backgroundImage?: string;
}>();

/** Every style field is a colour, a percentage or a flag. */
type StyleValue = string | number | boolean | undefined;

const emit = defineEmits<{
	applyPreset: [theme: FlyerTheme];
	clearTheme: [];
	updateTheme: [key: keyof FlyerTheme, value: StyleValue];
	updateBlockStyle: [blockId: FlyerBlockId, key: keyof FlyerBlockStyle, value: StyleValue];
	clearBlockStyle: [blockId: FlyerBlockId];
	toggleVisibility: [blockId: FlyerBlockId];
	selectBlock: [blockId: FlyerBlockId];
}>();

const { t } = useI18n();

const matching = ref(false);
const matchError = ref('');

/** Blocks whose text would be hard to read on what is behind them. */
const poorContrast = computed(() => {
	const flagged = new Set<FlyerBlockId>();
	for (const block of props.blocks) {
		if (block.visible === false) continue;
		if (checkBlockContrast(block.id, props.theme, props.blockStyles).isPoor) {
			flagged.add(block.id);
		}
	}
	return flagged;
});

async function matchBackground() {
	if (!props.backgroundImage) return;
	matchError.value = '';
	matching.value = true;
	try {
		const brightness = await averageImageLuminance(props.backgroundImage);
		emit('applyPreset', themeForBackground(brightness));
	} catch {
		matchError.value = t('retreatFlyerEditor.design.matchFailed');
	} finally {
		matching.value = false;
	}
}

/** Listed the way they read on the flyer, so the list matches what you see. */
const orderedBlocks = computed(() =>
	[...props.blocks].sort((a, b) => {
		const bySlot = FLYER_SLOTS.indexOf(a.slot) - FLYER_SLOTS.indexOf(b.slot);
		return bySlot !== 0 ? bySlot : a.order - b.order;
	}),
);
</script>
