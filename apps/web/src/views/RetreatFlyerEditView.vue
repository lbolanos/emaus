<template>
	<div class="p-4 md:p-6">
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
				{{ t('retreatFlyerEditor.draftRecovered', store.draftRestoredAt.toLocaleString()) }}
			</span>
			<Button variant="outline" size="sm" @click="store.discardDraft()">
				{{ t('retreatFlyerEditor.discardDraft') }}
			</Button>
		</div>

		<div class="grid gap-6 lg:grid-cols-[22rem_1fr]">
			<!-- Side panel -->
			<Card class="h-fit lg:sticky lg:top-4">
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
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{{ t('retreatFlyerEditor.preview') }}
				</h2>
				<!--
					The ref goes here, on the box the flyer actually has to fit into: measuring
					the wrapper counted its padding as usable width and the flyer overflowed.
					overflow-x-hidden because a scaled element keeps its full 850px layout box,
					which would otherwise show up as a horizontal scrollbar under the preview.
				-->
				<div
					ref="previewColumnRef"
					class="max-h-[42vh] overflow-y-auto overflow-x-hidden lg:max-h-none lg:overflow-visible"
					:style="{ height: previewHeight }"
				>
					<RetreatFlyerCanvas
						ref="canvasRef"
						:retreat="retreat"
						:flyer-options="store.draftOptions"
						:layout="store.blocks"
						:image-overrides="store.images"
						:theme="store.theme"
						:block-styles="store.blockStyles"
						:registration-link="walkerRegistrationLink"
						:scale="previewScale"
						editable
						:selected-block-id="store.selectedBlockId"
						:highlight-slot="store.highlightSlot"
						:empty-slot-label="t('retreatFlyerEditor.emptySlot')"
						@edit-text="jumpToTextField"
						@move-block="store.moveBlock"
						@select-block="store.selectBlock"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Loader2, Redo2, RotateCcw, Undo2 } from 'lucide-vue-next';
import { Button, Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';
import { useRetreatStore } from '@/stores/retreatStore';
import { getRetreatFlyerOptions } from '@/services/api';
import { useFlyerEditorStore } from '@/stores/flyerEditorStore';
import RetreatFlyerCanvas from '@/components/flyer/RetreatFlyerCanvas.vue';
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
const otherRetreats = computed(() =>
	(retreatStore.retreats as any[]).filter((r) => r.id !== retreatId.value),
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
	const options = await getRetreatFlyerOptions(sourceId);
	if (options) store.applyTemplate(options);
	// The select always shows the placeholder again; the copy is in the draft
	const select = document.querySelector('[data-copy-design-select]') as HTMLSelectElement | null;
	if (select) select.value = '';
}

/**
 * Double-clicked copy on the flyer: open the Texts tab on that exact field,
 * scrolled into view, focused and flashed once.
 */
function jumpToTextField(overrideKey: string) {
	activeTab.value = 'texts';
	// The tab content mounts asynchronously and something along the way
	// (remount, the Tabs transition) hands focus back to <body>. Retry on
	// frames until it sticks, bounded — then flash the field.
	const settle = (attempts = 24) => {
		const field = document.getElementById(`flyer-text-${overrideKey}`);
		// The input mounts when the Tabs content does — later than nextTick.
		// Retry on frames until it exists AND holds focus, bounded.
		if (!field) {
			if (attempts > 0) requestAnimationFrame(() => settle(attempts - 1));
			return;
		}
		field.scrollIntoView({ block: 'center', behavior: 'smooth' });
		field.focus();
		if (document.activeElement === field || attempts <= 0) {
			field.classList.add('flyer-field-flash');
			window.setTimeout(() => field.classList.remove('flyer-field-flash'), 1600);
			return;
		}
		requestAnimationFrame(() => settle(attempts - 1));
	};
	nextTick(() => settle());
}

const updateScale = () => {
	if (!previewColumnRef.value) return;
	previewScale.value = Math.min(previewColumnRef.value.clientWidth / 850, 1);
	const el = canvasRef.value?.$el;
	if (el) canvasHeight.value = el.scrollHeight;
};

/** A scaled element keeps its unscaled layout box, so reserve the scaled height. */
const previewHeight = computed(() => {
	if (previewScale.value >= 1 || !canvasHeight.value) return undefined;
	return `${canvasHeight.value * previewScale.value}px`;
});

function discard() {
	store.loadFromRetreat(retreat.value);
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
	if (!retreatStore.retreats.length) retreatStore.fetchRetreats().catch(() => {});
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

<style scoped>
@keyframes flyerFieldFlash {
	0%,
	100% {
		box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
	}
	30% {
		box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.45);
	}
}

.flyer-field-flash {
	animation: flyerFieldFlash 1.6s ease-out 1;
	border-radius: 6px;
}
</style>
