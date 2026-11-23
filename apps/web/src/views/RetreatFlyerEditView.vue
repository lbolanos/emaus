<template>
	<div class="p-2 md:p-3">
		<!-- Toolbar -->
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-3">
				<Button variant="ghost" size="sm" as-child>
					<router-link :to="{ name: 'retreat-flyer', params: { id: retreatId } }">
						<ArrowLeft class="mr-1.5 h-4 w-4" />
						{{ t('retreatFlyerEditor.backToFlyer') }}
					</router-link>
				</Button>
				<h1 class="text-lg font-semibold">{{ t('retreatFlyerEditor.title') }}</h1>
			</div>

			<div class="flex items-center gap-2">
				<!-- Copy another retreat's design as the starting point (undoable) -->
				<select
					class="h-8 rounded-md border border-muted bg-transparent px-2 text-xs text-muted-foreground"
					data-copy-design-select
					:value="''"
					@change="copyDesignFrom(($event.target as HTMLSelectElement).value)"
				>
					<option value="" disabled>
						{{ t('retreatFlyerEditor.copyDesignFrom') }}
					</option>
					<option v-for="other in otherRetreats" :key="other.id" :value="other.id">
						{{ other.parish }} — {{ formatDateLabel(other.startDate) }}
					</option>
				</select>
				<span v-if="copyError" class="text-xs text-destructive" data-copy-error>
					{{ copyError }}
				</span>
				<span v-if="store.isDirty" class="text-xs text-amber-600">
					{{ t('retreatFlyerEditor.unsavedChanges') }}
				</span>
				<Button
					variant="ghost"
					size="sm"
					:disabled="!store.canUndo || store.saving"
					:title="t('retreatFlyerEditor.undoHint')"
					@click="store.undo()"
				>
					<Undo2 class="mr-1.5 h-4 w-4" />
					{{ t('retreatFlyerEditor.undo') }}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					:disabled="!store.canRedo || store.saving"
					:title="t('retreatFlyerEditor.redoHint')"
					@click="store.redo()"
				>
					<Redo2 class="mr-1.5 h-4 w-4" />
					{{ t('retreatFlyerEditor.redo') }}
				</Button>
				<Button
					variant="outline"
					size="sm"
					:disabled="!store.isDirty || store.saving"
					@click="discard"
				>
					{{ t('retreatFlyerEditor.discard') }}
				</Button>
				<Button size="sm" :disabled="!store.isDirty || store.saving" @click="store.save()">
					<Loader2 v-if="store.saving" class="mr-1.5 h-4 w-4 animate-spin" />
					{{ store.saving ? t('retreatFlyerEditor.saving') : t('retreatFlyerEditor.save') }}
				</Button>
			</div>
		</div>

		<!-- A design session the browser tab took with it, back from localStorage -->
		<div
			v-if="store.draftRestoredAt"
			class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
			data-draft-banner
		>
			<span>
				{{ t('retreatFlyerEditor.draftRecovered', [store.draftRestoredAt.toLocaleString()]) }}
			</span>
			<Button variant="outline" size="sm" @click="store.discardDraft()">
				{{ t('retreatFlyerEditor.discardDraft') }}
			</Button>
		</div>

		<div class="grid gap-6 lg:grid-cols-[28rem_1fr]">
			<!-- Side panel -->
			<Card class="h-fit lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
				<CardContent class="p-4">
					<Tabs v-model="activeTab" default-value="design">
						<TabsList class="grid w-full grid-cols-4">
							<TabsTrigger value="design">{{ t('retreatFlyerEditor.tabs.design') }}</TabsTrigger>
							<TabsTrigger value="images">{{ t('retreatFlyerEditor.tabs.images') }}</TabsTrigger>
							<TabsTrigger value="texts">{{ t('retreatFlyerEditor.tabs.texts') }}</TabsTrigger>
							<TabsTrigger value="templates">
								{{ t('retreatFlyerEditor.tabs.templates') }}
							</TabsTrigger>
						</TabsList>

						<TabsContent value="design" class="mt-4">
							<FlyerDesignPanel
								:blocks="store.blocks"
								:background-image="store.images.bodyBackground || FLYER_PRESET_IMAGES.bodyBackground"
								:theme="store.theme"
								:block-styles="store.blockStyles"
								:selected-block-id="store.selectedBlockId"
								:contentless-blocks="contentlessBlocks"
								@move-block="store.moveBlock"
								@apply-preset="store.applyThemePreset"
								@clear-theme="store.clearTheme"
								@update-theme="store.setThemeField"
								@update-block-style="store.setBlockStyleField"
								@clear-block-style="store.clearBlockStyle"
								@toggle-visibility="store.toggleVisibility"
								@select-block="store.selectBlock"
								@hover-slot="store.setHighlightSlot"
							/>
							<Button variant="ghost" size="sm" class="mt-4 w-full" @click="store.resetToDefaultLayout()">
								<RotateCcw class="mr-1.5 h-4 w-4" />
								{{ t('retreatFlyerEditor.resetLayout') }}
							</Button>
						</TabsContent>

						<TabsContent value="images" class="mt-4 space-y-4">
							<p class="text-sm text-muted-foreground">
								{{ t('retreatFlyerEditor.images.hint') }}
							</p>
							<FlyerImagePicker
								v-for="key in FLYER_IMAGE_KEYS"
								:key="key"
								:image-key="key"
								:model-value="store.images[key]"
								@update="store.setImage(key, $event)"
							/>
						</TabsContent>

						<TabsContent value="texts" class="mt-4">
							<FlyerTextPanel
								:values="store.textOverrides"
								:hidden-texts="store.hiddenTexts"
								@update="store.setTextOverride"
								@toggle-visibility="store.toggleTextVisibility"
							/>
						</TabsContent>

						<TabsContent value="templates" class="mt-4">
							<FlyerTemplatePanel
								:layout="store.draftOptions"
								:retreat="retreat"
								:registration-link="walkerRegistrationLink"
								@apply="store.applyTemplate"
							/>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>

			<!--
				Live preview. On a phone the panel is a screenful of its own, which left the
				flyer a screen and a half below: you hid a block or changed a colour and saw
				nothing happen. So on small screens it comes first and sticks to the top,
				capped in height with its own scroll. From lg up the two columns sit side by
				side as before.
			-->
			<div
				class="order-first min-w-0 sticky top-0 z-20 -mx-4 border-b bg-gray-100 px-4 pb-3 pt-2 lg:static lg:order-none lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0"
			>
				<div class="mb-2 flex items-center justify-between gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						{{ t('retreatFlyerEditor.preview') }}
					</h2>
					<!-- Shrink the preview so the whole flyer fits the pane at a glance -->
					<div class="flex items-center gap-1" data-preview-zoom>
						<button
							type="button"
							class="rounded border border-muted p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
							:aria-label="t('retreatFlyerEditor.zoomOut')"
							:disabled="previewZoom <= 0.4"
							@click="previewZoom = Math.max(0.4, previewZoom - 0.1)"
						>
							<Minus class="h-3.5 w-3.5" />
						</button>
						<button
							type="button"
							class="w-11 text-center text-[11px] tabular-nums text-muted-foreground"
							:title="t('retreatFlyerEditor.zoomReset')"
							@click="previewZoom = 1"
						>
							{{ Math.round(previewZoom * 100) }}%
						</button>
						<button
							type="button"
							class="rounded border border-muted p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
							:aria-label="t('retreatFlyerEditor.zoomIn')"
							:disabled="previewZoom >= 1"
							@click="previewZoom = Math.min(1, previewZoom + 0.1)"
						>
							<Plus class="h-3.5 w-3.5" />
						</button>
					</div>
				</div>
				<!--
					The ref goes here, on the box the flyer actually has to fit into: measuring
					the wrapper counted its padding as usable width and the flyer overflowed.
					overflow-x-hidden because a scaled element keeps its full 850px layout box,
					which would otherwise show up as a horizontal scrollbar under the preview.
				-->
				<div
					ref="previewColumnRef"
					class="max-h-[42vh] self-start overflow-y-auto overflow-x-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
				>
					<!-- The inner box clips the canvas's UNSCALED layout box (a transform
					     does not shrink it) down to the scaled size. Its height is what
					     the pane measures: once the scaled flyer fits the pane, the
					     scrollbar is gone — not full of empty space below. -->
					<div :style="{ height: previewHeight }" class="overflow-hidden">
						<RetreatFlyerCanvas
							ref="canvasRef"
							:retreat="retreat"
							:flyer-options="store.draftOptions"
							:layout="store.blocks"
							:image-overrides="store.images"
							:theme="store.theme"
							:block-styles="store.blockStyles"
							:registration-link="walkerRegistrationLink"
							:scale="effectivePreviewScale"
							editable
							:selected-block-id="store.selectedBlockId"
							:highlight-slot="store.highlightSlot"
							:empty-slot-label="t('retreatFlyerEditor.emptySlot')"
							@edit-text="jumpToTextField"
							@move-block="store.moveBlock"
							@resize-block="store.setBlockWidth"
							@select-block="store.selectBlock"
						/>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Loader2, Minus, Plus, Redo2, RotateCcw, Undo2 } from 'lucide-vue-next';
import { Button, Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';
import { useRetreatStore } from '@/stores/retreatStore';
import { getRetreatFlyerOptions } from '@/services/api';
import { useFlyerEditorStore } from '@/stores/flyerEditorStore';
import RetreatFlyerCanvas from '@/components/flyer/RetreatFlyerCanvas.vue';
import { contactBlockHasItems } from '@/composables/useFlyerContent';
import { focusFlyerTextField } from '@/utils/flyerTextJump';
import FlyerDesignPanel from '@/components/flyer/editor/FlyerDesignPanel.vue';
import FlyerTextPanel from '@/components/flyer/editor/FlyerTextPanel.vue';
import FlyerImagePicker from '@/components/flyer/editor/FlyerImagePicker.vue';
import FlyerTemplatePanel from '@/components/flyer/editor/FlyerTemplatePanel.vue';
import { FLYER_IMAGE_KEYS } from '@/components/flyer/flyerPresetAssets';
import { FLYER_PRESET_IMAGES } from '@/components/flyer/blockRegistry';

const route = useRoute();
const { t } = useI18n();
const retreatStore = useRetreatStore();
const store = useFlyerEditorStore();

const retreatId = computed(() => route.params.id as string);
const retreat = computed(() => (retreatStore.selectedRetreat as any) || null);

/** Blocks that draw nothing on this retreat — contact with no phones or
 *  emails is the whole list today. Their controls still apply the day the
 *  data arrives, but styling an invisible block reads as broken. */
const contentlessBlocks = computed(() => {
	if (contactBlockHasItems(retreat.value?.contactPhones)) return [];
	return ['contact'];
});
const walkerRegistrationLink = computed(() => retreatStore.walkerRegistrationLink);

// The available width is measured on the column, not on the wrapper around the canvas:
// a scaled element keeps its unscaled 850px layout box, so the wrapper's own width
// never changes and the observer would never fire a second time.
const previewColumnRef = ref<HTMLElement>();
const canvasRef = ref<{ $el: HTMLElement }>();
const previewScale = ref(1);
const canvasHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;

/** Which editor tab is open, so a double-click on the flyer can jump to Textos. */
const activeTab = ref('design');

/** Other retreats to copy a design from, loaded once on mount. */
/** Shown by the copy select when the source design could not be read. */
const copyError = ref('');

const otherRetreats = computed(() =>
	((retreatStore.retreats as any[]) ?? []).filter((r) => r.id !== retreatId.value),
);

function formatDateLabel(value: string) {
	return value ? new Date(value).toLocaleDateString() : '';
}

/**
 * Loads another retreat's saved design into the editor as the new draft —
 * nothing is persisted until Guardar, and Deshacer brings the previous
 * design back.
 */
async function copyDesignFrom(sourceId: string) {
	if (!sourceId) return;
	copyError.value = '';
	try {
		const options = await getRetreatFlyerOptions(sourceId);
		if (options) store.applyTemplate(options);
	} catch {
		// Silent would read as copied: nothing lands on the canvas and the user
		// saves a design that never changed
		copyError.value = t('retreatFlyerEditor.copyFailed');
	} finally {
		// The select always shows the placeholder again; the copy is in the draft
		const select = document.querySelector('[data-copy-design-select]') as HTMLSelectElement | null;
		if (select) select.value = '';
	}
}

/** Double-clicked copy on the flyer: open the Texts tab on that exact field. */
function jumpToTextField(overrideKey: string) {
	activeTab.value = 'texts';
	focusFlyerTextField(overrideKey);
}

/** Manual zoom on top of the width fit: shrink until the whole flyer fits. */
const previewZoom = ref(1);
const effectivePreviewScale = computed(() => previewScale.value * previewZoom.value);

const updateScale = () => {
	if (!previewColumnRef.value) return;
	previewScale.value = Math.min(previewColumnRef.value.clientWidth / 850, 1);
	const el = canvasRef.value?.$el;
	if (el) canvasHeight.value = el.scrollHeight;
};

/** A scaled element keeps its unscaled layout box, so reserve the scaled height. */
const previewHeight = computed(() => {
	// A transform does not shrink the layout box: without this explicit height
	// the pane stays as tall as the UNSCALED flyer and keeps a scrollbar full of
	// empty space below a flyer that already fits. Always track the effective
	// scale, including zoom on wide columns (previewScale >= 1).
	if (effectivePreviewScale.value >= 1 || !canvasHeight.value) return undefined;
	return `${canvasHeight.value * effectivePreviewScale.value}px`;
});

function discard() {
	// discardDraft, not a reload: reloading would find the autosaved draft and
	// put the just-discarded design right back
	store.discardDraft();
}

async function load(id: string) {
	if (!id) return;
	await retreatStore.fetchRetreat(id);
	store.loadFromRetreat(retreat.value);
	updateScale();
}

/** Cmd/Ctrl+Z, which is what everyone tries first. */
const onKeydown = (event: KeyboardEvent) => {
	if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
		const target = event.target as HTMLElement | null;
		// Let the browser undo typing inside a field
		if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
		event.preventDefault();
		if (event.shiftKey) store.redo();
		else store.undo();
	}
};

onMounted(async () => {
	if (!retreatStore.retreats?.length) retreatStore.fetchRetreats?.().catch(() => {});
	window.addEventListener('beforeunload', warnOnUnload);
	window.addEventListener('keydown', onKeydown);
	await load(retreatId.value);

	if (previewColumnRef.value) {
		updateScale();
		resizeObserver = new ResizeObserver(updateScale);
		resizeObserver.observe(previewColumnRef.value);
		const el = canvasRef.value?.$el;
		if (el) resizeObserver.observe(el);
	}
});

/**
 * Leaving with unsaved work used to lose it without a word — the most expensive thing
 * this screen could do to someone who just spent ten minutes on a design.
 */
const warnOnUnload = (event: BeforeUnloadEvent) => {
	if (!store.isDirty) return;
	event.preventDefault();
	// Chrome ignores the message and shows its own, but still needs returnValue set
	event.returnValue = '';
};

onBeforeRouteLeave(() => {
	if (!store.isDirty) return true;
	return window.confirm(t('retreatFlyerEditor.leaveWithoutSaving'));
});

onUnmounted(() => {
	resizeObserver?.disconnect();
	resizeObserver = null;
	window.removeEventListener('beforeunload', warnOnUnload);
	window.removeEventListener('keydown', onKeydown);
});

watch(retreatId, async (newId, oldId) => {
	if (newId && newId !== oldId) await load(newId);
});
</script>
