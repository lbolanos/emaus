<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useGlobalMessageTemplateStore } from '@/stores/globalMessageTemplateStore';
import { useMessageTemplateStore } from '@/stores/messageTemplateStore';
import { useCommunityMessageTemplateStore } from '@/stores/communityMessageTemplateStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { storeToRefs } from 'pinia';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@repo/ui';
import { Button } from '@repo/ui';
import { Tabs, TabsList, TabsTrigger } from '@repo/ui';
import { Checkbox } from '@repo/ui';
import { Badge } from '@repo/ui';
import { ScrollArea } from '@repo/ui';
import { Loader2, Download, Check } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

interface Props {
	open?: boolean;
	communityId: string;
}

interface Emits {
	(e: 'update:open', value: boolean): void;
	(e: 'complete'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { t } = useI18n();
const globalTemplateStore = useGlobalMessageTemplateStore();
const { templates: globalTemplates } = storeToRefs(globalTemplateStore);
const messageTemplateStore = useMessageTemplateStore();
const retreatStore = useRetreatStore();
const { retreats } = storeToRefs(retreatStore);

const isInternalOpen = ref(props.open);
const activeTab = ref<'global' | 'retreat'>('global');
const selectedGlobalTemplates = ref<Set<string>>(new Set());
const selectedRetreatTemplates = ref<Set<string>>(new Set());
const selectedRetreatId = ref<string>('');
const retreatTemplates = ref<any[]>([]);
const isLoading = ref(false);
const importSuccess = ref(false);
const importMessage = ref('');
const existingTemplateTypes = ref<Set<string>>(new Set());

// Format retreat name for display
const formatRetreatName = (retreat: any) => {
	const typeLabels: Record<string, string> = {
		men: 'Hombres',
		women: 'Mujeres',
		couples: 'Parejas',
		effeta: 'Effeta',
	};
	const typeLabel = retreat.retreat_type ? typeLabels[retreat.retreat_type] || retreat.retreat_type : '';
	const dateStr = new Date(retreat.startDate).toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' });
	return typeLabel ? `${retreat.parish} - ${typeLabel} (${dateStr})` : `${retreat.parish} (${dateStr})`;
};

// Watch for prop changes
watch(() => props.open, (newValue) => {
	isInternalOpen.value = newValue;
	if (newValue) {
		// Reset state when opening
		selectedGlobalTemplates.value.clear();
		selectedRetreatTemplates.value.clear();
		selectedRetreatId.value = '';
		retreatTemplates.value = [];
		importSuccess.value = false;
		importMessage.value = '';
		activeTab.value = 'global';
		loadData();
	}
});

watch(isInternalOpen, (newValue) => {
	emit('update:open', newValue);
});

const loadData = async () => {
	try {
		// Fetch global templates
		await globalTemplateStore.fetchAll();

		// Fetch community templates to check for existing types
		const communityTemplateStore = useCommunityMessageTemplateStore();
		await communityTemplateStore.fetchTemplates(props.communityId);
		existingTemplateTypes.value = new Set(communityTemplateStore.templates.map(t => t.type));

		// Fetch retreats
		await retreatStore.fetchRetreats();
	} catch (error) {
		console.error('Error loading data:', error);
	}
};

// Filter out system templates
const filteredGlobalTemplates = computed(() => {
	return globalTemplates.value.filter(template =>
		!!template.isActive && !template.type.startsWith('SYS_')
	);
});

// Check if template already exists in community
const templateExists = (type: string) => {
	return existingTemplateTypes.value.has(type);
};

const toggleGlobalTemplate = (templateId: string) => {
	if (selectedGlobalTemplates.value.has(templateId)) {
		selectedGlobalTemplates.value.delete(templateId);
	} else {
		selectedGlobalTemplates.value.add(templateId);
	}
};

const isGlobalSelected = (templateId: string) => {
	return selectedGlobalTemplates.value.has(templateId);
};

const toggleRetreatTemplate = (templateId: string) => {
	if (selectedRetreatTemplates.value.has(templateId)) {
		selectedRetreatTemplates.value.delete(templateId);
	} else {
		selectedRetreatTemplates.value.add(templateId);
	}
};

const isRetreatSelected = (templateId: string) => {
	return selectedRetreatTemplates.value.has(templateId);
};

const handleRetreatChange = async () => {
	if (selectedRetreatId.value) {
		try {
			await messageTemplateStore.fetchTemplates(selectedRetreatId.value);
			retreatTemplates.value = messageTemplateStore.templates;
		} catch (error) {
			console.error('Error loading retreat templates:', error);
			retreatTemplates.value = [];
		}
	}
};

const importFromGlobal = async () => {
	if (selectedGlobalTemplates.value.size === 0) {
		importMessage.value = 'Por favor selecciona al menos una plantilla';
		return;
	}

	isLoading.value = true;
	try {
		let successCount = 0;
		let updateCount = 0;

		for (const templateId of selectedGlobalTemplates.value) {
			const template = globalTemplates.value.find(t => t.id === templateId);
			if (template) {
				const wasExisting = templateExists(template.type);
				await globalTemplateStore.copyToCommunity(templateId, props.communityId);
				if (wasExisting) {
					updateCount++;
				} else {
					successCount++;
				}
			}
		}

		// Update existing template types
		const communityTemplateStore = useCommunityMessageTemplateStore();
		await communityTemplateStore.fetchTemplates(props.communityId);
		existingTemplateTypes.value = new Set(communityTemplateStore.templates.map(t => t.type));

		importSuccess.value = true;
		importMessage.value = `Importación completada: ${successCount} plantilla${successCount !== 1 ? 's' : ''} nueva${successCount !== 1 ? 's' : ''}, ${updateCount} actualizada${updateCount !== 1 ? 's' : ''}`;
		selectedGlobalTemplates.value.clear();
	} catch (error) {
		importSuccess.value = false;
		importMessage.value = 'Error al importar plantillas. Por favor intenta nuevamente.';
		console.error('Error importing templates:', error);
	} finally {
		isLoading.value = false;
	}
};

const importFromRetreat = async () => {
	if (selectedRetreatTemplates.value.size === 0) {
		importMessage.value = 'Por favor selecciona al menos una plantilla';
		return;
	}

	isLoading.value = true;
	try {
		let successCount = 0;
		let updateCount = 0;

		for (const templateId of selectedRetreatTemplates.value) {
			const template = retreatTemplates.value.find(t => t.id === templateId);
			if (template) {
				const wasExisting = templateExists(template.type);
				await messageTemplateStore.copyRetreatTemplateToCommunity(templateId, props.communityId);
				if (wasExisting) {
					updateCount++;
				} else {
					successCount++;
				}
			}
		}

		// Update existing template types
		const communityTemplateStore = useCommunityMessageTemplateStore();
		await communityTemplateStore.fetchTemplates(props.communityId);
		existingTemplateTypes.value = new Set(communityTemplateStore.templates.map(t => t.type));

		importSuccess.value = true;
		importMessage.value = `Importación completada: ${successCount} plantilla${successCount !== 1 ? 's' : ''} nueva${successCount !== 1 ? 's' : ''}, ${updateCount} actualizada${updateCount !== 1 ? 's' : ''}`;
		selectedRetreatTemplates.value.clear();
		retreatTemplates.value = [];
		selectedRetreatId.value = '';
	} catch (error) {
		importSuccess.value = false;
		importMessage.value = 'Error al importar plantillas. Por favor intenta nuevamente.';
		console.error('Error importing templates:', error);
	} finally {
		isLoading.value = false;
	}
};

const handleClose = () => {
	if (importSuccess.value) {
		emit('complete');
	}
	isInternalOpen.value = false;
};
</script>

<template>
	<Dialog :open="isInternalOpen" @update:open="handleClose">
		<DialogContent class="max-w-3xl max-h-[80vh]">
			<DialogHeader>
				<DialogTitle>{{ t('communityTemplates.import.title') }}</DialogTitle>
			</DialogHeader>

			<Tabs v-model="activeTab" class="w-full">
				<TabsList class="grid w-full grid-cols-2">
					<TabsTrigger value="global">{{ t('communityTemplates.import.fromGlobal') }}</TabsTrigger>
					<TabsTrigger value="retreat">{{ t('communityTemplates.import.fromRetreat') }}</TabsTrigger>
				</TabsList>

				<!-- From Global Tab -->
				<div v-if="activeTab === 'global'" class="mt-4 space-y-4">
					<p class="text-sm text-muted-foreground">
						{{ t('communityTemplates.import.globalDescription') }}
					</p>

					<div v-if="filteredGlobalTemplates.length === 0" class="text-center py-8 text-muted-foreground">
						No hay plantillas globales disponibles
					</div>

					<ScrollArea class="h-60">
						<div class="space-y-2 pr-4">
							<div
								v-for="(template, index) in filteredGlobalTemplates"
								:key="template.id"
								class="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
								:class="{ 'bg-muted/30': isGlobalSelected(template.id) }"
							>
								<Checkbox
									:checked="isGlobalSelected(template.id)"
									@click="toggleGlobalTemplate(template.id)"
									class="mt-1"
								/>
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<span class="font-medium">{{ template.name }}</span>
										<Badge v-if="templateExists(template.type)" variant="secondary" class="text-xs">
											{{ t('communityTemplates.import.willUpdate') }}
										</Badge>
										<Badge v-else variant="outline" class="text-xs">
											{{ t('communityTemplates.import.willCreate') }}
										</Badge>
									</div>
									<p class="text-sm text-muted-foreground">
										{{ t(`messageTemplates.types.${template.type}`) }}
									</p>
								</div>
							</div>
						</div>
					</ScrollArea>

					<div class="flex items-center justify-between pt-4 border-t">
						<span class="text-sm text-muted-foreground">
							{{ selectedGlobalTemplates.size }} {{ selectedGlobalTemplates.size === 1 ? 'plantilla seleccionada' : 'plantillas seleccionadas' }}
						</span>
						<Button
							@click="importFromGlobal"
							:disabled="selectedGlobalTemplates.size === 0 || isLoading"
						>
							<Loader2 v-if="isLoading" class="w-4 h-4 mr-2 animate-spin" />
							<Download v-else class="w-4 h-4 mr-2" />
							{{ isLoading ? t('common.importing') : t('communityTemplates.import.importSelected') }}
						</Button>
					</div>
				</div>

				<!-- From Retreat Tab -->
				<div v-if="activeTab === 'retreat'" class="mt-4 space-y-4">
					<p class="text-sm text-muted-foreground">
						{{ t('communityTemplates.import.retreatDescription') }}
					</p>

					<div class="space-y-4">
						<div>
							<label class="text-sm font-medium">{{ t('communityTemplates.import.selectRetreat') }}</label>
							<select
								v-model="selectedRetreatId"
								@change="handleRetreatChange"
								class="w-full mt-1 px-3 py-2 border rounded-md bg-background"
							>
								<option value="">{{ t('communityTemplates.import.chooseRetreat') }}</option>
								<option v-for="retreat in retreats" :key="retreat.id" :value="retreat.id">
									{{ formatRetreatName(retreat) }}
								</option>
							</select>
						</div>

						<div v-if="retreatTemplates.length === 0 && selectedRetreatId" class="text-center py-8 text-muted-foreground">
							No hay plantillas disponibles para este retiro
						</div>

						<div v-if="retreatTemplates.length > 0">
							<ScrollArea class="h-60">
								<div class="space-y-2 pr-4">
									<div
										v-for="template in retreatTemplates"
										:key="template.id"
										class="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
										:class="{ 'bg-muted/30': isRetreatSelected(template.id) }"
									>
										<Checkbox
											:checked="isRetreatSelected(template.id)"
											@click="toggleRetreatTemplate(template.id)"
											class="mt-1"
										/>
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-2">
												<span class="font-medium">{{ template.name }}</span>
												<Badge v-if="templateExists(template.type)" variant="secondary" class="text-xs">
													{{ t('communityTemplates.import.willUpdate') }}
												</Badge>
												<Badge v-else variant="outline" class="text-xs">
													{{ t('communityTemplates.import.willCreate') }}
												</Badge>
											</div>
											<p class="text-sm text-muted-foreground">
												{{ t(`messageTemplates.types.${template.type}`) }}
											</p>
										</div>
									</div>
								</div>
							</ScrollArea>

							<div class="flex items-center justify-between pt-4 border-t">
								<span class="text-sm text-muted-foreground">
									{{ selectedRetreatTemplates.size }} {{ selectedRetreatTemplates.size === 1 ? 'plantilla seleccionada' : 'plantillas seleccionadas' }}
								</span>
								<Button
									@click="importFromRetreat"
									:disabled="selectedRetreatTemplates.size === 0 || isLoading"
								>
									<Loader2 v-if="isLoading" class="w-4 h-4 mr-2 animate-spin" />
									<Download v-else class="w-4 h-4 mr-2" />
									{{ isLoading ? t('common.importing') : t('communityTemplates.import.importSelected') }}
								</Button>
							</div>
						</div>
					</div>
				</div>
			</Tabs>

			<!-- Import Status Message -->
			<div v-if="importMessage" class="mt-4 p-3 rounded-md" :class="importSuccess ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'">
				<div class="flex items-center gap-2">
					<Check v-if="importSuccess" class="w-4 h-4" />
					<span class="text-sm">{{ importMessage }}</span>
				</div>
			</div>

			<!-- Close Button (only show after successful import) -->
			<div v-if="importSuccess" class="mt-4 pt-4 border-t flex justify-end">
				<Button @click="handleClose">
					{{ t('common.close') }}
				</Button>
			</div>
		</DialogContent>
	</Dialog>
</template>
