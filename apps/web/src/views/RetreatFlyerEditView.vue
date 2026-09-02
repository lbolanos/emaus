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
				<span v-if="store.isDirty" class="text-xs text-amber-600">
					{{ t('retreatFlyerEditor.unsavedChanges') }}
				</span>
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

		<div class="grid gap-6 lg:grid-cols-[22rem_1fr]">
			<!-- Side panel -->
			<Card class="h-fit lg:sticky lg:top-4">
				<CardContent class="p-4">
					<Tabs default-value="blocks">
						<TabsList class="grid w-full grid-cols-3">
							<TabsTrigger value="blocks">{{ t('retreatFlyerEditor.tabs.blocks') }}</TabsTrigger>
							<TabsTrigger value="images">{{ t('retreatFlyerEditor.tabs.images') }}</TabsTrigger>
							<TabsTrigger value="texts">{{ t('retreatFlyerEditor.tabs.texts') }}</TabsTrigger>
						</TabsList>

						<TabsContent value="blocks" class="mt-4">
							<FlyerBlockList
								:blocks-by-slot="store.blocksBySlot"
								@move="store.moveBlock"
								@toggle="store.toggleVisibility"
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
							<FlyerTextPanel :values="store.textOverrides" @update="store.setTextOverride" />
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>

			<!-- Live preview -->
			<div ref="previewColumnRef" class="min-w-0">
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{{ t('retreatFlyerEditor.preview') }}
				</h2>
				<div :style="{ height: previewHeight }">
					<RetreatFlyerCanvas
						ref="canvasRef"
						:retreat="retreat"
						:flyer-options="store.draftOptions"
						:layout="store.blocks"
						:image-overrides="store.images"
						:registration-link="walkerRegistrationLink"
						:scale="previewScale"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-vue-next';
import { Button, Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';
import { useRetreatStore } from '@/stores/retreatStore';
import { useFlyerEditorStore } from '@/stores/flyerEditorStore';
import RetreatFlyerCanvas from '@/components/flyer/RetreatFlyerCanvas.vue';
import FlyerBlockList from '@/components/flyer/editor/FlyerBlockList.vue';
import FlyerTextPanel from '@/components/flyer/editor/FlyerTextPanel.vue';
import FlyerImagePicker from '@/components/flyer/editor/FlyerImagePicker.vue';
import { FLYER_IMAGE_KEYS } from '@/components/flyer/flyerPresetAssets';

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

onMounted(async () => {
	await load(retreatId.value);

	if (previewColumnRef.value) {
		updateScale();
		resizeObserver = new ResizeObserver(updateScale);
		resizeObserver.observe(previewColumnRef.value);
		const el = canvasRef.value?.$el;
		if (el) resizeObserver.observe(el);
	}
});

onUnmounted(() => {
	resizeObserver?.disconnect();
	resizeObserver = null;
});

watch(retreatId, async (newId, oldId) => {
	if (newId && newId !== oldId) await load(newId);
});
</script>
