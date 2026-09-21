import { computed, ref, shallowRef } from 'vue';
import {
	FLYER_LAYOUT_VERSION,
	type FlyerBlockStyle,
	type FlyerImages,
	type FlyerSlot,
	type FlyerTheme,
} from '@repo/types';
import { moveBlockInLayout, type AnyBlockLayout } from '@/utils/flyerLayout';

/**
 * What a flyer flavour needs to plug into the editor machinery. Everything else
 * (undo, dirty tracking, block moves, theme/block-style/text operations, the
 * draft that carries `untouchedOptions` through a save) is flavour-agnostic and
 * lives in the setup built here.
 */
export interface FlyerEditorConfig<TBlock extends AnyBlockLayout> {
	/**
	 * Parses a stored options object into blocks + images. Flavour-specific on
	 * purpose: the retreat reconciles v1 rows, the meeting seeds the community's
	 * background when there is no saved design yet.
	 */
	resolveLayout: (raw: Record<string, any> | null | undefined) => {
		blocks: TBlock[];
		images: FlyerImages;
	};
	/** Text override keys this editor exposes, in the order they appear on the flyer. */
	textOverrideKeys: readonly string[];
	/** Persists the whole options object for the loaded entity. */
	persist: (entityId: string, options: Record<string, any>) => Promise<unknown>;
}

/**
 * Builds the pinia setup function for a flyer editor. Each flavour wraps the
 * result in its own `defineStore` and renames the load entry point to its
 * domain (`loadFromRetreat`, `loadFromCommunity`) so call sites read naturally.
 */
export function createFlyerEditorStoreSetup<TBlock extends AnyBlockLayout>(
	config: FlyerEditorConfig<TBlock>,
) {
	return () => {
		const entityId = ref<string | null>(null);
		/** Everything in the options column we don't edit here, carried through on save. */
		const untouchedOptions = ref<Record<string, any>>({});
		// shallowRef: every mutation replaces the array wholesale, and deep-unwrapping
		// a generic TBlock[] fights UnwrapRefSimple at the call sites.
		const blocks = shallowRef<TBlock[]>([]);
		const images = ref<FlyerImages>({});
		const theme = ref<FlyerTheme>({});
		const blockStyles = ref<Partial<Record<string, FlyerBlockStyle>>>({});
		const textOverrides = ref<Record<string, string>>({});
		/** Texts left off the flyer entirely — different from an empty override. */
		const hiddenTexts = ref<string[]>([]);
		/** Which block the editor panel is showing the style of. */
		const selectedBlockId = ref<string | null>(null);
		const savedSnapshot = ref('');
		const saving = ref(false);

		/** Serialised states to step back through. Capped: this is undo, not history. */
		const undoStack = ref<string[]>([]);
		const UNDO_LIMIT = 30;
		/** Set while undoing, so restoring a state doesn't get pushed as a new step. */
		let restoring = false;

		/** Serialised form of what save() would send, used to detect changes. */
		const snapshot = computed(() =>
			JSON.stringify({
				blocks: blocks.value,
				images: images.value,
				theme: theme.value,
				blockStyles: blockStyles.value,
				texts: textOverrides.value,
				hidden: hiddenTexts.value,
			}),
		);

		const isDirty = computed(() => snapshot.value !== savedSnapshot.value);

		const blocksBySlot = computed(() => {
			const bySlot: Record<FlyerSlot, TBlock[]> = { left: [], right: [], wide: [] };
			for (const block of blocks.value) {
				bySlot[block.slot]?.push(block);
			}
			for (const slot of Object.keys(bySlot) as FlyerSlot[]) {
				bySlot[slot].sort((a, b) => a.order - b.order);
			}
			return bySlot;
		});

		/** The options object as it would be persisted, also used for the live preview. */
		const draftOptions = computed(() => ({
			...untouchedOptions.value,
			...textOverrides.value,
			layoutVersion: FLYER_LAYOUT_VERSION,
			blocks: blocks.value,
			images: images.value,
			theme: theme.value,
			blockStyles: blockStyles.value,
			hiddenTexts: hiddenTexts.value,
		}));

		/** Records the state before a change, so it can be stepped back to. */
		function pushUndo() {
			if (restoring) return;
			undoStack.value = [...undoStack.value, snapshot.value].slice(-UNDO_LIMIT);
		}

		const canUndo = computed(() => undoStack.value.length > 0);

		function applySnapshot(serialised: string) {
			const state = JSON.parse(serialised);
			restoring = true;
			blocks.value = state.blocks;
			images.value = state.images;
			theme.value = state.theme;
			blockStyles.value = state.blockStyles;
			textOverrides.value = state.texts;
			hiddenTexts.value = state.hidden;
			restoring = false;
		}

		function undo() {
			const previous = undoStack.value[undoStack.value.length - 1];
			if (previous === undefined) return;
			undoStack.value = undoStack.value.slice(0, -1);
			applySnapshot(previous);
		}

		function loadFrom(id: string | null, raw: Record<string, any> | null | undefined) {
			entityId.value = id ?? null;
			const options = (raw ?? {}) as Record<string, any>;

			const resolved = config.resolveLayout(options);
			blocks.value = resolved.blocks;
			images.value = resolved.images;
			theme.value = { ...(options.theme ?? {}) };
			blockStyles.value = { ...(options.blockStyles ?? {}) };
			hiddenTexts.value = [...(options.hiddenTexts ?? [])];
			selectedBlockId.value = null;

			const texts: Record<string, string> = {};
			for (const key of config.textOverrideKeys) {
				texts[key] = options[key] ?? '';
			}
			textOverrides.value = texts;

			// Keep the rest of the options column (legacy flags, settings owned by
			// other screens…) so saving the flyer never drops them: the PUT replaces
			// the whole column.
			const rest: Record<string, any> = {};
			for (const [key, value] of Object.entries(options)) {
				const isOurs =
					key === 'layoutVersion' ||
					key === 'blocks' ||
					key === 'images' ||
					key === 'theme' ||
					key === 'blockStyles' ||
					key === 'hiddenTexts' ||
					config.textOverrideKeys.includes(key);
				if (!isOurs) rest[key] = value;
			}
			untouchedOptions.value = rest;

			savedSnapshot.value = snapshot.value;
			// Nothing to step back to once we (re)load the entity
			undoStack.value = [];
		}

		function moveBlock(blockId: string, toSlot: FlyerSlot, toIndex: number) {
			pushUndo();
			blocks.value = moveBlockInLayout(blocks.value, blockId as TBlock['id'], toSlot, toIndex);
		}

		function toggleVisibility(blockId: string) {
			pushUndo();
			blocks.value = blocks.value.map((block) =>
				block.id === blockId ? { ...block, visible: !block.visible } : block,
			);
		}

		function setImage(key: keyof FlyerImages, url: string | undefined) {
			pushUndo();
			images.value = { ...images.value, [key]: url || undefined };
		}

		function setTextOverride(key: string, value: string) {
			pushUndo();
			textOverrides.value = { ...textOverrides.value, [key]: value };
		}

		function toggleTextVisibility(key: string) {
			pushUndo();
			hiddenTexts.value = hiddenTexts.value.includes(key)
				? hiddenTexts.value.filter((k) => k !== key)
				: [...hiddenTexts.value, key];
		}

		function selectBlock(blockId: string | null) {
			selectedBlockId.value = blockId;
		}

		/** An undefined value clears the field so the layer below shows through again. */
		function setThemeField<K extends keyof FlyerTheme>(key: K, value: FlyerTheme[K] | undefined) {
			pushUndo();
			const next = { ...theme.value };
			if (value === undefined) delete next[key];
			else next[key] = value;
			theme.value = next;
		}

		/**
		 * Applies a one-click look. Flavours whose block defaults paint boxes (the
		 * meeting's white cards) pass a `blockStyles` package so the look is coherent —
		 * set-or-clear, same contract as applyTemplate. The retreat passes nothing and
		 * keeps the theme-only behaviour.
		 */
		function applyThemePreset(
			preset: FlyerTheme,
			// Named so it can't shadow the `blockStyles` ref above: with the plain
			// name, `blockStyles.value = …` below assigns onto the parameter and
			// the ref (the thing the flyer reads) never changes.
			presetBlockStyles?: Partial<Record<string, FlyerBlockStyle>> | null,
		) {
			pushUndo();
			theme.value = { ...preset };
			if (presetBlockStyles) blockStyles.value = { ...presetBlockStyles };
		}

		/** Back to the built-in per-block defaults. */
		function clearTheme(alsoBlockStyles = false) {
			pushUndo();
			theme.value = {};
			if (alsoBlockStyles) blockStyles.value = {};
		}

		function setBlockStyleField<K extends keyof FlyerBlockStyle>(
			blockId: string,
			key: K,
			value: FlyerBlockStyle[K] | undefined,
		) {
			pushUndo();
			const current = { ...(blockStyles.value[blockId] ?? {}) };
			if (value === undefined) delete current[key];
			else current[key] = value;

			const next = { ...blockStyles.value };
			if (Object.keys(current).length === 0) delete next[blockId];
			else next[blockId] = current;
			blockStyles.value = next;
		}

		/** Drops the block's override so it follows the theme again. */
		function clearBlockStyle(blockId: string) {
			pushUndo();
			const next = { ...blockStyles.value };
			delete next[blockId];
			blockStyles.value = next;
		}

		/** Replaces the whole design with a snapshot layout (a template). */
		function applyTemplate(layout: Record<string, any>) {
			pushUndo();
			const resolved = config.resolveLayout(layout);
			blocks.value = resolved.blocks;
			images.value = resolved.images;
			// Set-or-clear: a template without a theme means "no theme", not "keep mine"
			theme.value = { ...(layout?.theme ?? {}) };
			blockStyles.value = { ...(layout?.blockStyles ?? {}) };
			hiddenTexts.value = [...(layout?.hiddenTexts ?? [])];

			const texts: Record<string, string> = {};
			for (const key of config.textOverrideKeys) {
				texts[key] = layout?.[key] ?? '';
			}
			textOverrides.value = texts;
		}

		function resetToDefaultLayout() {
			pushUndo();
			blocks.value = config.resolveLayout(null).blocks;
		}

		async function save() {
			if (!entityId.value) return;
			saving.value = true;
			try {
				await config.persist(entityId.value, draftOptions.value as Record<string, any>);
				savedSnapshot.value = snapshot.value;
				undoStack.value = [];
			} finally {
				saving.value = false;
			}
		}

		return {
			entityId,
			blocks,
			images,
			theme,
			blockStyles,
			selectedBlockId,
			textOverrides,
			hiddenTexts,
			canUndo,
			saving,
			isDirty,
			blocksBySlot,
			draftOptions,
			loadFrom,
			moveBlock,
			toggleVisibility,
			setImage,
			setTextOverride,
			toggleTextVisibility,
			selectBlock,
			setThemeField,
			applyThemePreset,
			clearTheme,
			setBlockStyleField,
			clearBlockStyle,
			undo,
			applyTemplate,
			resetToDefaultLayout,
			save,
		};
	};
}
