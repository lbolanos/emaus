<template>
	<div class="space-y-4">
		<p class="text-sm text-muted-foreground">{{ t('retreatFlyerEditor.templates.hint') }}</p>

		<!-- Save the current design -->
		<div class="space-y-2 rounded-lg border p-3">
			<Label for="flyer-template-name" class="text-xs">
				{{ t('retreatFlyerEditor.templates.name') }}
			</Label>
			<Input id="flyer-template-name" v-model="newName" :disabled="store.saving" />

			<template v-if="store.canShareWithCommunity">
				<Label class="text-xs">{{ t('retreatFlyerEditor.templates.scope') }}</Label>
				<div class="flex flex-wrap items-center gap-3">
					<label class="flex items-center gap-1.5 text-sm">
						<input v-model="scope" type="radio" value="personal" />
						{{ t('retreatFlyerEditor.templates.scopePersonal') }}
					</label>
					<label class="flex items-center gap-1.5 text-sm">
						<input v-model="scope" type="radio" value="community" />
						{{ t('retreatFlyerEditor.templates.scopeCommunity') }}
					</label>
				</div>
				<select
					v-if="scope === 'community'"
					v-model="communityId"
					class="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
				>
					<option value="">{{ t('retreatFlyerEditor.templates.selectCommunity') }}</option>
					<option v-for="community in store.communities" :key="community.id" :value="community.id">
						{{ community.name }}
					</option>
				</select>
			</template>

			<Button size="sm" class="w-full" :disabled="!canSave" @click="save">
				<Loader2 v-if="store.saving" class="mr-1.5 h-4 w-4 animate-spin" />
				{{ t('retreatFlyerEditor.templates.saveAsNew') }}
			</Button>
			<p v-if="error" class="text-[11px] text-destructive">{{ error }}</p>
		</div>

		<!-- Existing templates -->
		<p v-if="!store.templates.length && !store.loading" class="text-sm text-muted-foreground">
			{{ t('retreatFlyerEditor.templates.empty') }}
		</p>

		<ul class="space-y-2">
			<li
				v-for="template in store.templates"
				:key="template.id"
				class="flex items-center gap-2 rounded-md border px-2 py-1.5"
				:data-template="template.id"
			>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm">{{ template.name }}</p>
					<p class="text-[11px] text-muted-foreground">
						{{
							template.scope === 'community'
								? store.communityName(template.communityId) ||
									t('retreatFlyerEditor.templates.scopeCommunity')
								: t('retreatFlyerEditor.templates.scopePersonal')
						}}
					</p>
				</div>
				<!-- See it before committing to it: applying replaces the whole design -->
				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					:aria-label="t('retreatFlyerEditor.templates.preview')"
					:title="t('retreatFlyerEditor.templates.preview')"
					:data-preview="template.id"
					@click="previewing = template"
				>
					<Eye class="h-4 w-4" />
				</button>
				<Button size="sm" variant="outline" :data-apply="template.id" @click="confirmingApply = template">
					{{ t('retreatFlyerEditor.templates.apply') }}
				</Button>
				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
					:aria-label="t('retreatFlyerEditor.templates.delete')"
					:title="t('retreatFlyerEditor.templates.delete')"
					:data-delete="template.id"
					@click="confirmingDelete = template"
				>
					<Trash2 class="h-4 w-4" />
				</button>
			</li>
		</ul>

		<!-- Preview: the real canvas with this retreat's data and the template's design -->
		<Dialog :open="!!previewing" @update:open="(open: boolean) => !open && (previewing = null)">
			<DialogContent v-if="previewing" class="max-w-[900px]">
				<DialogHeader>
					<DialogTitle>{{ previewing.name }}</DialogTitle>
					<DialogDescription>
						{{ t('retreatFlyerEditor.templates.previewHint') }}
					</DialogDescription>
				</DialogHeader>

				<div class="max-h-[70vh] overflow-y-auto">
					<RetreatFlyerCanvas
						:retreat="retreat"
						:flyer-options="previewing.layout"
						:layout="previewLayout.blocks"
						:image-overrides="previewLayout.images"
						:theme="(previewing.layout as any)?.theme"
						:block-styles="(previewing.layout as any)?.blockStyles"
						:registration-link="registrationLink"
						:scale="0.62"
						:printable="false"
					/>
				</div>

				<DialogFooter>
					<Button variant="outline" size="sm" @click="previewing = null">
						{{ t('common.close') }}
					</Button>
					<Button size="sm" @click="applyFromPreview">
						{{ t('retreatFlyerEditor.templates.apply') }}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>

		<Dialog
			:open="!!confirmingApply"
			@update:open="(open: boolean) => !open && (confirmingApply = null)"
		>
			<DialogContent v-if="confirmingApply">
				<DialogHeader>
					<DialogTitle>{{ t('retreatFlyerEditor.templates.apply') }}</DialogTitle>
					<DialogDescription>
						{{ t('retreatFlyerEditor.templates.confirmApply') }}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" size="sm" @click="confirmingApply = null">
						{{ t('common.cancel') }}
					</Button>
					<Button size="sm" data-confirm-apply @click="applyConfirmed">
						{{ t('retreatFlyerEditor.templates.apply') }}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>

		<Dialog
			:open="!!confirmingDelete"
			@update:open="(open: boolean) => !open && (confirmingDelete = null)"
		>
			<DialogContent v-if="confirmingDelete">
				<DialogHeader>
					<DialogTitle>{{ confirmingDelete.name }}</DialogTitle>
					<DialogDescription>
						{{ t('retreatFlyerEditor.templates.confirmDelete') }}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" size="sm" @click="confirmingDelete = null">
						{{ t('common.cancel') }}
					</Button>
					<Button size="sm" variant="destructive" data-confirm-delete @click="deleteConfirmed">
						{{ t('retreatFlyerEditor.templates.delete') }}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Eye, Loader2, Trash2 } from 'lucide-vue-next';
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
} from '@repo/ui';
import type { FlyerTemplate } from '@repo/types';
import { useFlyerTemplateStore } from '@/stores/flyerTemplateStore';
import { apiErrorMessage } from '@/services/apiError';
import { resolveFlyerLayout } from '@/utils/flyerLayout';
import RetreatFlyerCanvas from '../RetreatFlyerCanvas.vue';

const props = defineProps<{
	/** The design that "save as template" should snapshot. */
	layout: Record<string, any>;
	/** Used to draw the preview with real data instead of a placeholder. */
	retreat?: any;
	registrationLink?: string;
}>();

const emit = defineEmits<{
	apply: [layout: Record<string, any>];
}>();

const { t } = useI18n();
const store = useFlyerTemplateStore();

const newName = ref('');
const scope = ref<'personal' | 'community'>('personal');
const communityId = ref('');
const error = ref('');

const previewing = ref<FlyerTemplate | null>(null);
const confirmingApply = ref<FlyerTemplate | null>(null);
const confirmingDelete = ref<FlyerTemplate | null>(null);

const canSave = computed(
	() =>
		!store.saving &&
		newName.value.trim().length > 0 &&
		(scope.value === 'personal' || !!communityId.value),
);

/** The stored design, normalised the same way the editor would load it. */
const previewLayout = computed(() =>
	resolveFlyerLayout((previewing.value?.layout ?? null) as Record<string, any> | null),
);

onMounted(async () => {
	// A failing list must leave the panel usable (you can still save a new template),
	// not bubble up as an unhandled rejection.
	try {
		await store.load();
	} catch (err) {
		error.value = apiErrorMessage(err);
	}
});

async function save() {
	// Belt and braces: the button is disabled, but a name is required either way
	if (!canSave.value) return;
	error.value = '';
	try {
		await store.create({
			name: newName.value.trim(),
			scope: scope.value,
			communityId: scope.value === 'community' ? communityId.value : null,
			layout: props.layout,
		});
		newName.value = '';
	} catch (err) {
		error.value = apiErrorMessage(err);
	}
}

function applyConfirmed() {
	if (!confirmingApply.value) return;
	emit('apply', confirmingApply.value.layout as Record<string, any>);
	confirmingApply.value = null;
}

/** Straight from the preview: you have just seen exactly what you are getting. */
function applyFromPreview() {
	if (!previewing.value) return;
	emit('apply', previewing.value.layout as Record<string, any>);
	previewing.value = null;
}

async function deleteConfirmed() {
	if (!confirmingDelete.value) return;
	error.value = '';
	try {
		await store.remove(confirmingDelete.value.id);
	} catch (err) {
		error.value = apiErrorMessage(err);
	} finally {
		confirmingDelete.value = null;
	}
}
</script>
