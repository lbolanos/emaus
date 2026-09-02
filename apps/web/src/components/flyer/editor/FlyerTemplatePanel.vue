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
				<Button size="sm" variant="outline" @click="apply(template)">
					{{ t('retreatFlyerEditor.templates.apply') }}
				</Button>
				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
					:aria-label="t('retreatFlyerEditor.templates.delete')"
					:title="t('retreatFlyerEditor.templates.delete')"
					@click="confirmRemove(template)"
				>
					<Trash2 class="h-4 w-4" />
				</button>
			</li>
		</ul>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loader2, Trash2 } from 'lucide-vue-next';
import { Button, Input, Label } from '@repo/ui';
import type { FlyerTemplate } from '@repo/types';
import { useFlyerTemplateStore } from '@/stores/flyerTemplateStore';
import { apiErrorMessage } from '@/services/apiError';

const props = defineProps<{
	/** The design that "save as template" should snapshot. */
	layout: Record<string, any>;
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

const canSave = computed(
	() =>
		!store.saving &&
		newName.value.trim().length > 0 &&
		(scope.value === 'personal' || !!communityId.value),
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

function apply(template: FlyerTemplate) {
	// Applying replaces the whole design, so make the user confirm it
	if (!window.confirm(t('retreatFlyerEditor.templates.confirmApply'))) return;
	emit('apply', template.layout as Record<string, any>);
}

async function confirmRemove(template: FlyerTemplate) {
	if (!window.confirm(t('retreatFlyerEditor.templates.confirmDelete'))) return;
	error.value = '';
	try {
		await store.remove(template.id);
	} catch (err) {
		error.value = apiErrorMessage(err);
	}
}
</script>
