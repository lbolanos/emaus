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

		<!-- A collapsible section per typography slot, closed by default: three
		     open cards crowded the panel. Family, size, colour and alignment
		     change independently, and a block only gets the slots it mixes. -->
		<FlyerPanelSection
			v-for="slot in fontSlots"
			:key="slot"
			:name="`font-${slot}`"
			:title="t(`retreatFlyerEditor.design.slot.${slot}`)"
			:open="openSlots[slot] ?? false"
			:data-font-slot-section="slot"
			@update:open="(open) => (openSlots[slot] = open)"
			@mouseenter="emit('hoverSlot', slot)"
			@mouseleave="emit('hoverSlot', null)"
		>
			<template #summary>
				<span class="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
					{{ slotSummary(slot) }}
				</span>
			</template>

			<div class="flex items-center gap-2">
				<span class="w-14 shrink-0 text-[11px] text-muted-foreground">
					{{ t('retreatFlyerEditor.design.row.family') }}
				</span>
				<select
					:value="values.fonts?.[slot]?.family ?? 'inherit'"
					class="h-7 min-w-0 flex-1 rounded border border-muted bg-transparent px-1 text-[11px]"
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
			</div>

			<div class="flex items-center gap-2">
				<span class="w-14 shrink-0 text-[11px] text-muted-foreground">
					{{ t('retreatFlyerEditor.design.row.size') }}
				</span>
				<div class="ml-auto flex items-center gap-1">
					<button
						type="button"
						class="rounded border border-muted p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
						:aria-label="t('retreatFlyerEditor.design.scaleDown')"
						:data-slot-scale-minus="slot"
						:disabled="(values.fonts?.[slot]?.scale ?? 100) <= 5"
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
						:disabled="(values.fonts?.[slot]?.scale ?? 100) >= 200"
						@click="stepScale(slot, 5)"
					>
						<Plus class="h-3.5 w-3.5" />
					</button>
					<button
						v-if="slotIsCustomized(slot)"
						type="button"
						class="rounded border border-muted p-1 text-muted-foreground transition-colors hover:text-foreground"
						:aria-label="t('retreatFlyerEditor.design.scaleReset')"
						:data-slot-scale-reset="slot"
						@click="clearSlot(slot)"
					>
						<RotateCcw class="h-3 w-3" />
					</button>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<span class="w-14 shrink-0 text-[11px] text-muted-foreground">
					{{ t('retreatFlyerEditor.design.row.color') }}
				</span>
				<div class="ml-auto flex items-center gap-1">
					<button
						v-for="hex in palette ?? []"
						:key="`art-${hex}`"
						type="button"
						class="h-6 w-6 rounded-full border"
						:class="
							values.fonts?.[slot]?.color?.toLowerCase() === hex
								? 'border-primary ring-2 ring-primary/40'
								: 'border-muted'
						"
						:style="{ backgroundColor: hex }"
						:aria-label="hex"
						:data-palette-swatch="hex"
						@click="emitSlot(slot, 'color', hex)"
					></button>
					<button
						v-for="swatch in COLOR_SWATCHES"
						:key="swatch"
						type="button"
						class="h-6 w-6 rounded border"
						:class="
							values.fonts?.[slot]?.color === swatch
								? 'border-primary ring-2 ring-primary/40'
								: 'border-muted'
						"
						:style="{ backgroundColor: swatch }"
						:aria-label="swatch"
						:data-slot-color-swatch="`${slot}:${swatch}`"
						@click="emitSlot(slot, 'color', swatch)"
					></button>
					<input
						type="color"
						class="h-6 w-8 cursor-pointer rounded border border-muted bg-transparent p-0.5"
						:value="values.fonts?.[slot]?.color ?? '#111827'"
						@input="emitSlot(slot, 'color', ($event.target as HTMLInputElement).value)"
					/>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<span class="w-14 shrink-0 text-[11px] text-muted-foreground">
					{{ t('retreatFlyerEditor.design.row.align') }}
				</span>
				<div class="ml-auto flex items-center gap-1.5">
					<button
						v-for="option in ALIGN_OPTIONS"
						:key="option.id"
						type="button"
						class="rounded border p-1.5 transition-colors"
						:class="
							(values.fonts?.[slot]?.align ?? inheritedAlign(slot)) === option.id
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-muted text-muted-foreground hover:text-foreground'
						"
						:aria-label="t(`retreatFlyerEditor.design.alignMode.${option.id}`)"
						:data-slot-align="`${slot}:${option.id}`"
						@click="emitSlot(slot, 'align', option.id)"
					>
						<component :is="option.icon" class="h-4 w-4" />
					</button>
				</div>
			</div>

			<!-- Auto follows the block-wide switch; Sí/No force this slot alone -->
			<div class="flex items-center gap-2">
				<span class="w-14 shrink-0 text-[11px] text-muted-foreground">
					{{ t('retreatFlyerEditor.design.row.shadow') }}
				</span>
				<div class="ml-auto flex items-center gap-1.5">
					<button
						v-for="option in SHADOW_OPTIONS"
						:key="option.id"
						type="button"
						class="rounded border px-2 py-1 text-[11px] transition-colors"
						:class="
							shadowState(slot) === option.state
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-muted text-muted-foreground hover:text-foreground'
						"
						:data-slot-shadow="`${slot}:${option.id}`"
						@click="
							emitSlot(slot, 'shadow', option.state === 'auto' ? undefined : option.state === 'on')
						"
					>
						{{ t(`retreatFlyerEditor.design.shadowMode.${option.id}`) }}
					</button>
				</div>
			</div>
		</FlyerPanelSection>

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
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlignCenter, AlignLeft, AlignRight, Minus, Plus, RotateCcw } from 'lucide-vue-next';
import { Label } from '@repo/ui';
import type { FlyerBlockStyle, FlyerFontFamily, FlyerFontSlot, FlyerFonts } from '@repo/types';
import { FLYER_FONT_STACKS } from '@/utils/flyerStyle';
import FlyerPanelSection from './FlyerPanelSection.vue';

const props = withDefaults(
	defineProps<{
		values: FlyerBlockStyle;
		/** Which typography slots to offer: the ones this block actually mixes. */
		fontSlots?: FlyerFontSlot[];
		/** Colours read off the artwork, offered before the stock swatches. */
		palette?: string[];
	}>(),
	{ fontSlots: () => ['title', 'emphasis', 'body'] },
);

const emit = defineEmits<{
	update: [
		key: keyof FlyerBlockStyle,
		value: string | number | boolean | FlyerFonts | undefined,
	];
	/** Pointer over a slot section: the canvas glows the lines it drives. */
	hoverSlot: [slot: string | null];
}>();

const { t } = useI18n();

/** Slot sections ship collapsed: three open cards crowded the panel. */
const openSlots = reactive<Partial<Record<FlyerFontSlot, boolean>>>({});

/** One glance at what the closed section holds: family and size. */
function slotSummary(slot: FlyerFontSlot): string {
	const family = props.values.fonts?.[slot]?.family;
	const scale = props.values.fonts?.[slot]?.scale ?? 100;
	const familyLabel =
		family && family !== 'inherit' ? t(`retreatFlyerEditor.design.font.${family}`) : null;
	return familyLabel ? `${familyLabel} · ${scale}%` : `${scale}%`;
}

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

const SHADOW_OPTIONS = [
	{ id: 'auto', state: 'auto' },
	{ id: 'on', state: 'on' },
	{ id: 'off', state: 'off' },
] as const;

/** 'auto' until the slot forces its own; mirrors the three buttons' states. */
function shadowState(slot: FlyerFontSlot): 'auto' | 'on' | 'off' {
	const shadow = props.values.fonts?.[slot]?.shadow;
	return shadow === undefined ? 'auto' : shadow ? 'on' : 'off';
}

/** 'inherit' renders in the panel's own font: it follows whatever layer is below. */
const FONT_OPTIONS: { id: FlyerFontFamily }[] = [
	{ id: 'inherit' },
	{ id: 'oswald' },
	{ id: 'playfair' },
	{ id: 'dancing' },
	{ id: 'mono' },
];

/** Steps the slot's size by 5%, clamped to the 5–200 range the schema allows. */
function stepScale(slot: FlyerFontSlot, delta: number) {
	const current = props.values.fonts?.[slot]?.scale ?? 100;
	const next = Math.min(200, Math.max(5, current + delta));
	emitSlot(slot, 'scale', String(next));
}

const COLOR_SWATCHES = ['#ffffff', '#111827', '#fde68a', '#1d4ed8'];

/** The alignment the slot shows before its own override: the flat block one. */
function inheritedAlign(slot: FlyerFontSlot): string {
	return props.values.textAlign ?? 'left';
}

/** Any knob of the slot moved away from its designed value. */
function slotIsCustomized(slot: FlyerFontSlot): boolean {
	return Object.keys(props.values.fonts?.[slot] ?? {}).some((k) => k !== 'align');
}

/** Drops the slot's whole override — back to whatever the layers below say. */
function clearSlot(slot: FlyerFontSlot) {
	const fonts: FlyerFonts = { ...(props.values.fonts ?? {}) };
	delete fonts[slot];
	emit('update', 'fonts', Object.keys(fonts).length ? fonts : undefined);
}

/**
 * Writes one field of one slot. 'inherit', 100% and undefined are the designed
 * state — they clear the field instead of being stored, so the layer below
 * (theme, then the block's default) shows through again.
 */
function emitSlot(
	slot: FlyerFontSlot,
	field: 'family' | 'scale' | 'color' | 'align' | 'shadow',
	raw: string | boolean | undefined,
) {
	const value = field === 'scale' ? Number(raw) : raw;
	const isDefault =
		raw === undefined ||
		(field === 'family' && value === 'inherit') ||
		(field === 'scale' && value === 100);
	const fonts: FlyerFonts = { ...(props.values.fonts ?? {}) };
	const spec = { ...(fonts[slot] ?? {}) };
	if (isDefault) delete spec[field];
	else (spec as Record<string, unknown>)[field] = value;
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
