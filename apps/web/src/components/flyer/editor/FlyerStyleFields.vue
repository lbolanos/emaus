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
					@click="option.color ? pickBackground(option.color) : clearBackground()"
				>
					{{ t(`retreatFlyerEditor.design.background.${option.id}`) }}
				</button>

				<label class="flex items-center gap-1" :title="t('retreatFlyerEditor.design.customColor')">
					<input
						type="color"
						class="h-7 w-9 cursor-pointer rounded border border-muted bg-transparent p-0.5"
						:value="values.backgroundColor ?? '#ffffff'"
						@input="pickBackground(($event.target as HTMLInputElement).value)"
					/>
				</label>
			</div>

			<div v-if="activeBackground !== 'none'" class="flex items-center gap-2">
				<span class="text-[11px] text-muted-foreground">
					{{ t('retreatFlyerEditor.design.opacity') }}
				</span>
				<input
					type="range"
					min="0"
					max="100"
					step="5"
					class="flex-1"
					data-opacity-slider
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

		<!-- One row per typography slot the block actually mixes: a block with two
		     kinds of lettering shows two rows, one with three shows three. -->
		<div class="space-y-1.5 rounded-md border border-muted p-2">
			<Label class="text-xs">{{ t('retreatFlyerEditor.design.typography') }}</Label>
			<div
				v-for="slot in fontSlots"
				:key="slot"
				class="flex items-center gap-2"
				:data-font-slot="slot"
			>
				<span class="w-16 shrink-0 text-[11px] capitalize text-muted-foreground">
					{{ t(`retreatFlyerEditor.design.slot.${slot}`) }}
				</span>
				<!-- The picker previews each family in itself; "Original" follows the
				     theme (or the flyer's Roboto at theme level) -->
				<select
					:value="values.fonts?.[slot]?.family ?? 'inherit'"
					class="h-7 w-24 shrink-0 rounded border border-muted bg-transparent px-1 text-[11px]"
					:style="{
						fontFamily:
							values.fonts?.[slot]?.family && values.fonts[slot]!.family !== 'inherit'
								? FLYER_FONT_STACKS[values.fonts[slot]!.family]
								: undefined,
					}"
					@change="emitSlot(slot, 'family', ($event.target as HTMLSelectElement).value)"
				>
					<option v-for="option in FONT_OPTIONS" :key="option.id" :value="option.id">
						{{ t(`retreatFlyerEditor.design.font.${option.id}`) }}
					</option>
				</select>
				<!-- Stepper instead of a slider: the row is too narrow to drag with
				     any precision, and taps land exactly on the 5% steps -->
				<div class="ml-auto flex items-center gap-1">
					<button
						type="button"
						class="rounded border border-muted p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
						:aria-label="t('retreatFlyerEditor.design.scaleDown')"
						:data-slot-scale-minus="slot"
						:disabled="(values.fonts?.[slot]?.scale ?? 100) <= 85"
						@click="stepScale(slot, -5)"
					>
						<Minus class="h-3.5 w-3.5" />
					</button>
					<span
						class="w-11 text-center text-[11px] tabular-nums text-muted-foreground"
						:data-slot-scale-value="slot"
					>
						{{ values.fonts?.[slot]?.scale ?? 100 }}%
					</span>
					<button
						type="button"
						class="rounded border border-muted p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
						:aria-label="t('retreatFlyerEditor.design.scaleUp')"
						:data-slot-scale-plus="slot"
						:disabled="(values.fonts?.[slot]?.scale ?? 100) >= 140"
						@click="stepScale(slot, 5)"
					>
						<Plus class="h-3.5 w-3.5" />
					</button>
					<button
						v-if="(values.fonts?.[slot]?.scale ?? 100) !== 100"
						type="button"
						class="rounded border border-muted p-1 text-muted-foreground transition-colors hover:text-foreground"
						:aria-label="t('retreatFlyerEditor.design.scaleReset')"
						:data-slot-scale-reset="slot"
						@click="emitSlot(slot, 'scale', '100')"
					>
						<RotateCcw class="h-3 w-3" />
					</button>
				</div>
			</div>
		</div>

		<!-- Not just the words: the icons, the bullets and the capped boxes move with them -->
		<div class="space-y-1.5">
			<Label class="text-xs">{{ t('retreatFlyerEditor.design.align') }}</Label>
			<div class="flex items-center gap-1.5">
				<button
					v-for="option in ALIGN_OPTIONS"
					:key="option.id"
					type="button"
					class="rounded border p-1.5 transition-colors"
					:class="
						values.textAlign === option.id
							? 'border-primary bg-primary/10 text-foreground'
							: 'border-muted text-muted-foreground hover:text-foreground'
					"
					:aria-label="t(`retreatFlyerEditor.design.alignMode.${option.id}`)"
					:title="t(`retreatFlyerEditor.design.alignMode.${option.id}`)"
					:data-align-option="option.id"
					@click="emit('update', 'textAlign', option.id)"
				>
					<component :is="option.icon" class="h-4 w-4" />
				</button>
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
import { AlignCenter, AlignLeft, AlignRight, Minus, Plus, RotateCcw } from 'lucide-vue-next';
import { Label } from '@repo/ui';
import type { FlyerBlockStyle, FlyerFontFamily, FlyerFontSlot, FlyerFonts } from '@repo/types';
import { FLYER_FONT_STACKS } from '@/utils/flyerStyle';

const props = withDefaults(
	defineProps<{
		values: FlyerBlockStyle;
		/** Which typography slots to offer: the ones this block actually mixes. */
		fontSlots?: FlyerFontSlot[];
	}>(),
	{ fontSlots: () => ['title', 'emphasis', 'body'] },
);

const emit = defineEmits<{
	update: [
		key: keyof FlyerBlockStyle,
		value: string | number | boolean | FlyerFonts | undefined,
	];
}>();

const { t } = useI18n();

const BACKGROUND_OPTIONS = [
	{ id: 'none', color: undefined },
	{ id: 'light', color: '#ffffff' },
	{ id: 'dark', color: '#000000' },
] as const;

const ALIGN_OPTIONS = [
	{ id: 'left', icon: AlignLeft },
	{ id: 'center', icon: AlignCenter },
	{ id: 'right', icon: AlignRight },
] as const;

/** 'inherit' renders in the panel's own font: it follows whatever layer is below. */
const FONT_OPTIONS: { id: FlyerFontFamily }[] = [
	{ id: 'inherit' },
	{ id: 'oswald' },
	{ id: 'playfair' },
	{ id: 'dancing' },
	{ id: 'mono' },
];

/** Steps the slot's size by 5%, clamped to the 85–140 range the schema allows. */
function stepScale(slot: FlyerFontSlot, delta: number) {
	const current = props.values.fonts?.[slot]?.scale ?? 100;
	const next = Math.min(140, Math.max(85, current + delta));
	emitSlot(slot, 'scale', String(next));
}

/**
 * Writes one field of one slot. 'inherit' and 100% are the designed state —
 * they clear the field instead of being stored, so the layer below (theme,
 * then the block's default) shows through again.
 */
function emitSlot(slot: FlyerFontSlot, field: 'family' | 'scale', raw: string) {
	const value = field === 'scale' ? Number(raw) : raw;
	const isDefault = field === 'family' ? value === 'inherit' : value === 100;
	const fonts: FlyerFonts = { ...(props.values.fonts ?? {}) };
	const spec = { ...(fonts[slot] ?? {}) };
	if (isDefault) delete spec[field];
	else spec[field] = value as never;
	if (Object.keys(spec).length === 0) delete fonts[slot];
	else fonts[slot] = spec;
	emit('update', 'fonts', Object.keys(fonts).length ? fonts : undefined);
}

const TEXT_SWATCHES = ['#ffffff', '#111827', '#1f2937', '#fde68a'];
const HEADING_SWATCHES = ['#fde68a', '#1d4ed8', '#15803d', '#ffffff'];

/** Opacity used when a colour is picked after the block was set to "no background". */
const DEFAULT_VEIL_OPACITY = 85;

const activeBackground = computed(() => {
	// A zero opacity is what "none" looks like on a block that inherits a box
	if (props.values.backgroundOpacity === 0) return 'none';
	if (!props.values.backgroundColor) return 'none';
	if (props.values.backgroundColor.toLowerCase() === '#ffffff') return 'light';
	if (props.values.backgroundColor.toLowerCase() === '#000000') return 'dark';
	return 'custom';
});

/**
 * Turning the box off has to be explicit. Simply dropping `backgroundColor` would only
 * uncover whatever the layer below sets — and the cost block does default to a veil.
 */
function clearBackground() {
	emit('update', 'backgroundColor', undefined);
	emit('update', 'backgroundOpacity', 0);
}

function pickBackground(colour: string) {
	emit('update', 'backgroundColor', colour);
	if ((props.values.backgroundOpacity ?? 0) === 0) {
		emit('update', 'backgroundOpacity', DEFAULT_VEIL_OPACITY);
	}
}
</script>
