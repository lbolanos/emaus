import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
	FLYER_LAYOUT_VERSION,
	type FlyerBlockId,
	type FlyerBlockLayout,
	type FlyerBlockStyle,
	type FlyerImages,
	type FlyerSlot,
	type FlyerTheme,
} from '@repo/types';
import { moveBlockInLayout, resolveFlyerLayout } from '@/utils/flyerLayout';
import { useRetreatStore } from '@/stores/retreatStore';

/** Text overrides the editor exposes, in the order they appear on the flyer. */
export const FLYER_TEXT_OVERRIDE_KEYS = [
	'catholicRetreatOverride',
	'emausForOverride',
	'weekendOfHopeOverride',
	'hopeOverride',
	'hopeQuoteOverride',
	'encounterDescriptionOverride',
	'dareToLiveItOverride',
	'arrivalTimeNoteOverride',
	'whatToBringOverride',
	'registerOverride',
	'scanToRegisterOverride',
	'comeOverride',
	'limitedCapacityOverride',
	'dontMissItOverride',
	'reservationNoteOverride',
] as const;

export type FlyerTextOverrideKey = (typeof FLYER_TEXT_OVERRIDE_KEYS)[number];

export const useFlyerEditorStore = defineStore('flyerEditor', () => {
	const retreatStore = useRetreatStore();

	const retreatId = ref<string | null>(null);
	/** Everything in flyer_options we don't edit here, carried through on save. */
	const untouchedOptions = ref<Record<string, any>>({});
	const blocks = ref<FlyerBlockLayout[]>([]);
	const images = ref<FlyerImages>({});
	const theme = ref<FlyerTheme>({});
	const blockStyles = ref<Partial<Record<FlyerBlockId, FlyerBlockStyle>>>({});
	const textOverrides = ref<Record<string, string>>({});
	/** Which block the editor panel is showing the style of. */
	const selectedBlockId = ref<FlyerBlockId | null>(null);
	const savedSnapshot = ref('');
	const saving = ref(false);

	/** Serialised form of what save() would send, used to detect changes. */
	const snapshot = computed(() =>
		JSON.stringify({
			blocks: blocks.value,
			images: images.value,
			theme: theme.value,
			blockStyles: blockStyles.value,
			texts: textOverrides.value,
		}),
	);

	const isDirty = computed(() => snapshot.value !== savedSnapshot.value);

	const blocksBySlot = computed(() => {
		const bySlot: Record<FlyerSlot, FlyerBlockLayout[]> = { left: [], right: [], wide: [] };
		for (const block of blocks.value) {
			bySlot[block.slot]?.push(block);
		}
		for (const slot of Object.keys(bySlot) as FlyerSlot[]) {
			bySlot[slot].sort((a, b) => a.order - b.order);
		}
		return bySlot;
	});

	/** flyer_options as it would be persisted, also used for the live preview. */
	const draftOptions = computed(() => ({
		...untouchedOptions.value,
		...textOverrides.value,
		layoutVersion: FLYER_LAYOUT_VERSION,
		blocks: blocks.value,
		images: images.value,
		theme: theme.value,
		blockStyles: blockStyles.value,
	}));

	function loadFromRetreat(retreat: any) {
		retreatId.value = retreat?.id ?? null;
		const options = (retreat?.flyer_options ?? {}) as Record<string, any>;

		const resolved = resolveFlyerLayout(options);
		blocks.value = resolved.blocks;
		images.value = resolved.images;
		theme.value = { ...(options.theme ?? {}) };
		blockStyles.value = { ...(options.blockStyles ?? {}) };
		selectedBlockId.value = null;

		const texts: Record<string, string> = {};
		for (const key of FLYER_TEXT_OVERRIDE_KEYS) {
			texts[key] = options[key] ?? '';
		}
		textOverrides.value = texts;

		// Keep the rest of flyer_options (legacy flags, showPickupInfo…) so saving the
		// flyer never drops settings owned by other screens.
		const rest: Record<string, any> = {};
		for (const [key, value] of Object.entries(options)) {
			const isOurs =
				key === 'layoutVersion' ||
				key === 'blocks' ||
				key === 'images' ||
				key === 'theme' ||
				key === 'blockStyles' ||
				(FLYER_TEXT_OVERRIDE_KEYS as readonly string[]).includes(key);
			if (!isOurs) rest[key] = value;
		}
		untouchedOptions.value = rest;

		savedSnapshot.value = snapshot.value;
	}

	function moveBlock(blockId: FlyerBlockId, toSlot: FlyerSlot, toIndex: number) {
		blocks.value = moveBlockInLayout(blocks.value, blockId, toSlot, toIndex);
	}

	function toggleVisibility(blockId: FlyerBlockId) {
		blocks.value = blocks.value.map((block) =>
			block.id === blockId ? { ...block, visible: !block.visible } : block,
		);
	}

	function setImage(key: keyof FlyerImages, url: string | undefined) {
		images.value = { ...images.value, [key]: url || undefined };
	}

	function setTextOverride(key: FlyerTextOverrideKey, value: string) {
		textOverrides.value = { ...textOverrides.value, [key]: value };
	}

	function selectBlock(blockId: FlyerBlockId | null) {
		selectedBlockId.value = blockId;
	}

	/** An undefined value clears the field so the layer below shows through again. */
	function setThemeField<K extends keyof FlyerTheme>(key: K, value: FlyerTheme[K] | undefined) {
		const next = { ...theme.value };
		if (value === undefined) delete next[key];
		else next[key] = value;
		theme.value = next;
	}

	function applyThemePreset(preset: FlyerTheme) {
		theme.value = { ...preset };
	}

	/** Back to the built-in per-block defaults. */
	function clearTheme() {
		theme.value = {};
	}

	function setBlockStyleField<K extends keyof FlyerBlockStyle>(
		blockId: FlyerBlockId,
		key: K,
		value: FlyerBlockStyle[K] | undefined,
	) {
		const current = { ...(blockStyles.value[blockId] ?? {}) };
		if (value === undefined) delete current[key];
		else current[key] = value;

		const next = { ...blockStyles.value };
		if (Object.keys(current).length === 0) delete next[blockId];
		else next[blockId] = current;
		blockStyles.value = next;
	}

	/** Drops the block's override so it follows the theme again. */
	function clearBlockStyle(blockId: FlyerBlockId) {
		const next = { ...blockStyles.value };
		delete next[blockId];
		blockStyles.value = next;
	}

	/** Replaces the whole design with a template's snapshot. */
	function applyTemplate(layout: Record<string, any>) {
		const resolved = resolveFlyerLayout(layout);
		blocks.value = resolved.blocks;
		images.value = resolved.images;
		// Set-or-clear: a template without a theme means "no theme", not "keep mine"
		theme.value = { ...(layout?.theme ?? {}) };
		blockStyles.value = { ...(layout?.blockStyles ?? {}) };

		const texts: Record<string, string> = {};
		for (const key of FLYER_TEXT_OVERRIDE_KEYS) {
			texts[key] = layout?.[key] ?? '';
		}
		textOverrides.value = texts;
	}

	function resetToDefaultLayout() {
		const resolved = resolveFlyerLayout(null);
		blocks.value = resolved.blocks;
	}

	async function save() {
		if (!retreatId.value) return;
		saving.value = true;
		try {
			await retreatStore.updateRetreat({
				id: retreatId.value,
				flyer_options: draftOptions.value,
			} as any);
			savedSnapshot.value = snapshot.value;
		} finally {
			saving.value = false;
		}
	}

	return {
		retreatId,
		blocks,
		images,
		theme,
		blockStyles,
		selectedBlockId,
		textOverrides,
		saving,
		isDirty,
		blocksBySlot,
		draftOptions,
		loadFromRetreat,
		moveBlock,
		toggleVisibility,
		setImage,
		setTextOverride,
		selectBlock,
		setThemeField,
		applyThemePreset,
		clearTheme,
		setBlockStyleField,
		clearBlockStyle,
		applyTemplate,
		resetToDefaultLayout,
		save,
	};
});
