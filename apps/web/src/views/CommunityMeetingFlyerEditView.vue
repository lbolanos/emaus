<template>
	<div class="p-2 md:p-3">
		<!-- Toolbar -->
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-3">
				<Button variant="ghost" size="sm" as-child>
					<router-link
						:to="{
							name: 'community-meeting-flyer',
							params: { id: communityId, meetingId },
						}"
					>
						<ArrowLeft class="mr-1.5 h-4 w-4" />
						{{ t('meetingFlyerEditor.backToFlyer') }}
					</router-link>
				</Button>
				<h1 class="text-lg font-semibold">{{ t('meetingFlyerEditor.title') }}</h1>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<!-- Another community's design as the starting point (undoable) -->
				<select
					v-if="otherCommunities.length"
					class="h-8 rounded-md border border-muted bg-transparent px-2 text-xs text-muted-foreground"
					data-copy-design-select
					:value="''"
					@change="copyDesignFrom(($event.target as HTMLSelectElement).value)"
				>
					<option value="" disabled>
						{{ t('meetingFlyerEditor.copyDesignFrom') }}
					</option>
					<option v-for="other in otherCommunities" :key="other.id" :value="other.id">
						{{ other.name }}
					</option>
				</select>
				<span v-if="copyError" class="text-xs text-destructive" data-copy-error>
					{{ copyError }}
				</span>
				<span v-if="store.isDirty" class="text-xs text-amber-600">
					{{ t('meetingFlyerEditor.unsavedChanges') }}
				</span>
				<Button
					variant="ghost"
					size="sm"
					:disabled="!store.canUndo || store.saving"
					:title="t('meetingFlyerEditor.undoHint')"
					@click="store.undo()"
				>
					<Undo2 class="mr-1.5 h-4 w-4" />
					{{ t('meetingFlyerEditor.undo') }}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					:disabled="!store.canRedo || store.saving"
					:title="t('meetingFlyerEditor.redoHint')"
					@click="store.redo()"
				>
					<Redo2 class="mr-1.5 h-4 w-4" />
					{{ t('meetingFlyerEditor.redo') }}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					:disabled="!hasSavedDesign || store.saving || resetting"
					:title="t('meetingFlyerEditor.clearDesignHint')"
					@click="clearDesign"
				>
					<Trash2 class="mr-1.5 h-4 w-4" />
					{{ t('meetingFlyerEditor.clearDesign') }}
				</Button>
				<Button
					variant="outline"
					size="sm"
					:disabled="!store.isDirty || store.saving"
					@click="discard"
				>
					{{ t('meetingFlyerEditor.discard') }}
				</Button>
				<Button size="sm" :disabled="!store.isDirty || store.saving" @click="save">
					<Loader2 v-if="store.saving" class="mr-1.5 h-4 w-4 animate-spin" />
					{{ store.saving ? t('meetingFlyerEditor.saving') : t('meetingFlyerEditor.save') }}
				</Button>
			</div>
		</div>

		<!-- A design session the browser tab took with it, back from localStorage.
		     Without this notice the draft came back silently: the editor opened
		     with changes nobody remembered making. -->
		<div
			v-if="store.draftRestoredAt"
			class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
			data-draft-banner
		>
			<span>
				{{ t('meetingFlyerEditor.draftRecovered', [store.draftRestoredAt.toLocaleString()]) }}
			</span>
			<Button variant="outline" size="sm" @click="store.discardDraft()">
				{{ t('meetingFlyerEditor.discardDraft') }}
			</Button>
		</div>

		<div class="grid gap-6 lg:grid-cols-[28rem_1fr]">
			<!-- Side panel -->
			<Card class="h-fit lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
				<CardContent class="p-4">
					<Tabs v-model="activeTab" default-value="design">
						<TabsList class="grid w-full grid-cols-3">
							<TabsTrigger value="design">{{ t('meetingFlyerEditor.tabs.design') }}</TabsTrigger>
							<TabsTrigger value="images">{{ t('meetingFlyerEditor.tabs.images') }}</TabsTrigger>
							<TabsTrigger value="texts">{{ t('meetingFlyerEditor.tabs.texts') }}</TabsTrigger>
						</TabsList>

						<TabsContent value="design" class="mt-4">
							<FlyerDesignPanel
								t-prefix="meetingFlyerEditor"
								:style-defaults="MEETING_FLYER_BLOCK_STYLE_DEFAULTS"
								:font-slots-by-block="MEETING_FLYER_BLOCK_FONT_SLOTS"
								:presets="MEETING_FLYER_THEME_PRESETS"
								:blocks="store.blocks"
								:background-image="
									store.images.bodyBackground || MEETING_FLYER_PRESET_IMAGES.bodyBackground
								"
								:theme="store.theme"
								:block-styles="store.blockStyles"
								:selected-block-id="store.selectedBlockId"
								:contentless-blocks="contentlessBlocks"
								@move-block="store.moveBlock"
								@apply-preset="applyLook"
								@clear-theme="() => store.clearTheme(true)"
								@update-theme="store.setThemeField"
								@update-block-style="store.setBlockStyleField"
								@clear-block-style="store.clearBlockStyle"
								@toggle-visibility="store.toggleVisibility"
								@select-block="store.selectBlock"
								@hover-slot="store.setHighlightSlot"
							/>
							<Button
								variant="ghost"
								size="sm"
								class="mt-4 w-full"
								@click="store.resetToDefaultLayout()"
							>
								<RotateCcw class="mr-1.5 h-4 w-4" />
								{{ t('meetingFlyerEditor.resetLayout') }}
							</Button>
						</TabsContent>

						<TabsContent value="images" class="mt-4 space-y-4">
							<p class="text-sm text-muted-foreground">
								{{ t('meetingFlyerEditor.images.hint') }}
							</p>
							<FlyerImagePicker
								v-for="key in FLYER_IMAGE_KEYS"
								:key="key"
								t-prefix="meetingFlyerEditor"
								:presets-by-kind="MEETING_FLYER_PRESET_ASSETS"
								:image-key="key"
								:model-value="store.images[key]"
								@update="store.setImage(key, $event)"
							/>
						</TabsContent>

						<TabsContent value="texts" class="mt-4">
							<FlyerTextPanel
								t-prefix="meetingFlyerEditor"
								:config="MEETING_TEXT_PANEL_CONFIG"
								:values="store.textOverrides"
								:hidden-texts="store.hiddenTexts"
								:placeholder-overrides="placeholderOverrides"
								@update="store.setTextOverride"
								@toggle-visibility="store.toggleTextVisibility"
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
				side. Same layout call as the retreat editor.
			-->
			<div
				class="order-first min-w-0 sticky top-0 z-20 -mx-4 border-b bg-gray-100 px-4 pb-3 pt-2 lg:static lg:order-none lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0"
			>
				<div class="mb-2 flex items-center justify-between gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						{{ t('meetingFlyerEditor.preview') }}
					</h2>
					<!-- Shrink the preview so the whole flyer fits the pane at a glance -->
					<div class="flex items-center gap-1" data-preview-zoom>
						<button
							type="button"
							class="rounded border border-muted p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
							:aria-label="t('meetingFlyerEditor.zoomOut')"
							:disabled="previewZoom <= 0.4"
							@click="previewZoom = Math.max(0.4, previewZoom - 0.1)"
						>
							<Minus class="h-3.5 w-3.5" />
						</button>
						<button
							type="button"
							class="w-11 text-center text-[11px] tabular-nums text-muted-foreground"
							:title="t('meetingFlyerEditor.zoomReset')"
							@click="previewZoom = 1"
						>
							{{ Math.round(previewZoom * 100) }}%
						</button>
						<button
							type="button"
							class="rounded border border-muted p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
							:aria-label="t('meetingFlyerEditor.zoomIn')"
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
					     does not shrink it) down to the scaled size, so once the zoomed
					     flyer fits the pane the scrollbar goes away. -->
					<div :style="{ height: previewHeight }" class="overflow-hidden">
					<MeetingFlyerCanvas
						ref="canvasRef"
						:meeting="meeting"
						:community="community"
						:flyer-options="store.draftOptions"
						:layout="store.blocks"
						:image-overrides="store.images"
						:theme="store.theme"
						:block-styles="store.blockStyles"
						:scale="effectivePreviewScale"
						:printable="false"
						editable
						:selected-block-id="store.selectedBlockId"
						:highlight-slot="store.highlightSlot"
						:empty-slot-label="t('meetingFlyerEditor.emptySlot')"
						@move-block="store.moveBlock"
						@resize-block="store.setBlockWidth"
						@select-block="store.selectBlock"
						@edit-text="jumpToTextField"
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
import { ArrowLeft, Loader2, Minus, Plus, Redo2, RotateCcw, Trash2, Undo2 } from 'lucide-vue-next';
import { Button, Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger, useToast } from '@repo/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { getCommunities, getCommunityFlyerOptions } from '@/services/api';
import { focusFlyerTextField } from '@/utils/flyerTextJump';
import { useMeetingFlyerEditorStore, MEETING_FLYER_TEXT_OVERRIDE_KEYS } from '@/stores/meetingFlyerEditorStore';
import MeetingFlyerCanvas from '@/components/flyers/MeetingFlyerCanvas.vue';
import FlyerDesignPanel from '@/components/flyer/editor/FlyerDesignPanel.vue';
import FlyerTextPanel from '@/components/flyer/editor/FlyerTextPanel.vue';
import FlyerImagePicker from '@/components/flyer/editor/FlyerImagePicker.vue';
import type { FlyerTextPanelConfig } from '@/components/flyer/editor/flyerTextConfig';
import { FLYER_IMAGE_KEYS } from '@/components/flyer/flyerPresetAssets';
import type { FlyerBlockStyle, FlyerTheme } from '@repo/types';
import { innerAvailableWidth } from '@/utils/flyerScale';
import {
	MEETING_FLYER_BLOCK_FONT_SLOTS,
	MEETING_FLYER_BLOCK_STYLE_DEFAULTS,
	MEETING_FLYER_PRESET_ASSETS,
	MEETING_FLYER_PRESET_IMAGES,
	MEETING_FLYER_THEME_PRESETS,
	meetingPresetBlockStyles,
} from '@/components/flyers/meetingBlockRegistry';

const route = useRoute();
const { t } = useI18n();
const { toast } = useToast();
const communityStore = useCommunityStore();
const store = useMeetingFlyerEditorStore();

const communityId = computed(() => route.params.id as string);
const meetingId = computed(() => route.params.meetingId as string);
const community = ref<any>(null);
/** The meeting whose data the preview renders — the design itself belongs to the community. */
const meeting = ref<any>(null);

const hasSavedDesign = computed(() => Array.isArray(community.value?.flyerOptions?.blocks));

/** Which editor tab is open, so a double-click on the flyer can jump to Textos. */
const activeTab = ref('design');

/** Blocks that draw nothing for this community — the map QR without a Google
 *  Maps link. Their controls still apply the day the link arrives, but styling
 *  an invisible block reads as broken. */
const contentlessBlocks = computed(() =>
	community.value?.googleMapsUrl?.trim() ? [] : ['locationQr'],
);

/** Other communities to copy a design from, loaded once on mount. */
const allCommunities = ref<{ id: string; name: string }[]>([]);
const otherCommunities = computed(() =>
	allCommunities.value.filter((c) => c.id !== communityId.value),
);
/** Shown by the copy select when the source design could not be read. */
const copyError = ref('');

/**
 * Loads another community's saved design into the editor as the new draft —
 * nothing is persisted until Guardar, and Deshacer brings the previous design
 * back.
 */
async function copyDesignFrom(sourceId: string) {
	if (!sourceId) return;
	copyError.value = '';
	try {
		const options = await getCommunityFlyerOptions(sourceId);
		if (options) store.applyTemplate(options);
	} catch {
		// Silent would read as copied: nothing lands and the user saves a design
		// that never changed
		copyError.value = t('meetingFlyerEditor.copyFailed');
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

const placeholderOverrides = computed<Record<string, string>>(() => ({
	// The meeting's own title is the natural placeholder for its override.
	titleOverride: meeting.value?.title || '',
}));

/**
 * The panel mirrors the retreat's except for the keys: labels instead of header
 * fragments, and the title's default comes from the meeting (placeholderOverrides
 * above), not from a shared i18n string.
 */
const MEETING_TEXT_PANEL_CONFIG: FlyerTextPanelConfig = {
	keys: MEETING_FLYER_TEXT_OVERRIDE_KEYS,
	multilineKeys: [],
	defaultKeys: {
		kickerOverride: 'kicker',
		dateLabelOverride: 'dateLabel',
		durationLabelOverride: 'durationLabel',
		descriptionLabelOverride: 'descriptionLabel',
		locationLabelOverride: 'locationLabel',
		qrCaptionOverride: 'qrCaption',
		footerTextOverride: 'footerText',
	},
	defaultPrefix: 'meetingFlyer',
};

// The available width is measured on the column, not on the wrapper around the canvas:
// a scaled element keeps its unscaled 850px layout box, so the wrapper's own width
// never changes and the observer would never fire a second time.
const previewColumnRef = ref<HTMLElement>();
const canvasRef = ref<{ $el: HTMLElement }>();
const previewScale = ref(1);
const canvasHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;

const updateScale = () => {
	if (!previewColumnRef.value) return;
	// Padding measured out, same as the published view's scale: the column's
	// padding is not width the 850px design may use.
	previewScale.value = Math.min(innerAvailableWidth(previewColumnRef.value) / 850, 1);
	const el = canvasRef.value?.$el;
	if (el) canvasHeight.value = el.scrollHeight;
};

/** Manual zoom on top of the width fit: shrink until the whole flyer fits. */
const previewZoom = ref(1);
const effectivePreviewScale = computed(() => previewScale.value * previewZoom.value);

/** A scaled element keeps its unscaled layout box, so reserve the scaled height. */
const previewHeight = computed(() => {
	// Tracks the EFFECTIVE scale, zoom included: without it the pane stays as
	// tall as the unscaled flyer and keeps a scrollbar of empty space
	if (effectivePreviewScale.value >= 1 || !canvasHeight.value) return undefined;
	return `${canvasHeight.value * effectivePreviewScale.value}px`;
});

// discardDraft, not a reload: reloading restores the autosaved draft, so
// "Descartar cambios" put the very changes it was asked to throw away back
function discard() {
	store.discardDraft();
}

/**
 * Saving is the action users trust blindly: a rejected PUT with no feedback
 * reads as "saved" and the design dies on the next navigation. The dirty badge
 * survives a failure (the store only snapshots on success) — this adds the
 * missing half, telling the user it did NOT save.
 */
async function save() {
	try {
		await store.save();
	} catch {
		toast({ title: t('meetingFlyerEditor.saveFailed'), variant: 'destructive' });
	}
}

/**
 * Presets and "match to the image" arrive as whole looks here. When the recipe
 * doesn't ship its own box reset, the meeting's boxed defaults still need one —
 * otherwise a light-text look lands its text on the white cards.
 */
function applyLook(theme: FlyerTheme, blockStyles?: Partial<Record<string, FlyerBlockStyle>>) {
	store.applyThemePreset(theme, blockStyles ?? meetingPresetBlockStyles(theme));
}

/** Drops the community's saved design altogether: back to the built-in defaults. */
const resetting = ref(false);
async function clearDesign() {
	if (!community.value || resetting.value) return;
	if (!window.confirm(t('meetingFlyerEditor.confirmClearDesign'))) return;
	resetting.value = true;
	try {
		const updated = await communityStore.clearFlyerOptions(community.value.id);
		community.value = updated;
		store.loadFromCommunity(updated);
		toast({ title: t('meetingFlyerEditor.designCleared') });
	} catch {
		toast({ title: t('meetingFlyerEditor.clearDesignFailed'), variant: 'destructive' });
	} finally {
		resetting.value = false;
	}
}

async function load(id: string, id2: string) {
	if (!id || !id2) return;
	// Independent requests: the community (the design's owner) and the meetings
	// list (this preview's data source — there is no single-meeting endpoint, so
	// the list comes whole and this finds its meeting by id).
	const [, meetings] = await Promise.all([
		communityStore.fetchCommunity(id),
		communityStore.fetchMeetings(id),
	]);
	community.value = communityStore.currentCommunity;
	meeting.value = meetings?.find((m: any) => m.id === id2) ?? null;
	store.loadFromCommunity(community.value);
	updateScale();
}

/** Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z redoes — what everyone tries first. */
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
	window.addEventListener('beforeunload', warnOnUnload);
	window.addEventListener('keydown', onKeydown);
	// Best effort: without the list the copy select simply does not show
	getCommunities()
		.then((list) => (allCommunities.value = (list ?? []) as { id: string; name: string }[]))
		.catch(() => {});
	await load(communityId.value, meetingId.value);

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
	return window.confirm(t('meetingFlyerEditor.leaveWithoutSaving'));
});

onUnmounted(() => {
	resizeObserver?.disconnect();
	resizeObserver = null;
	window.removeEventListener('beforeunload', warnOnUnload);
	window.removeEventListener('keydown', onKeydown);
});

watch(
	() => [route.params.id, route.params.meetingId] as const,
	([newId, newMeetingId], [oldId, oldMeetingId]) => {
		if (newId && (newId !== oldId || newMeetingId !== oldMeetingId)) {
			load(String(newId), String(newMeetingId));
		}
	},
);
</script>
