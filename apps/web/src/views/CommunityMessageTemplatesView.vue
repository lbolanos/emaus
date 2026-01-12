<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useCommunityMessageTemplateStore } from '@/stores/communityMessageTemplateStore';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Button } from '@repo/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui';
import { Input } from '@repo/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';
import { Badge } from '@repo/ui';
import { Search, ChevronUp, ChevronDown, Download, ChevronRight } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import type { MessageTemplate } from '@repo/types';
import BaseMessageTemplateModal from '@/components/BaseMessageTemplateModal.vue';
import CommunityTemplateImportModal from '@/components/CommunityTemplateImportModal.vue';

const props = defineProps<{
	id: string;
}>();

const { t } = useI18n();
const store = useCommunityMessageTemplateStore();
const { templates, loading, error } = storeToRefs(store);
const communityStore = useCommunityStore();
const { currentCommunity, members } = storeToRefs(communityStore);

const isDialogOpen = ref(false);
const currentTemplate = ref<Partial<MessageTemplate> | null>(null);
const isImportDialogOpen = ref(false);
const searchQuery = ref('');
const selectedTypeFilter = ref<string>('all');
const expandedRows = ref<Set<string>>(new Set());

// Table sorting variables
const sortField = ref<'name' | 'type'>('name');
const sortDirection = ref<'asc' | 'desc'>('asc');

// Format members for modal
const formattedMembers = computed(() => {
	return members.value.map((member: any) => ({
		id: member.id,
		name: `${member.firstName} ${member.lastName}`,
		type: 'COMMUNITY',
		firstName: member.firstName,
		lastName: member.lastName,
		nickname: member.nickname || '',
		cellPhone: member.cellPhone || '',
		email: member.email || '',
	}));
});

// Enhanced table computed properties
const filteredAndSortedTemplates = computed(() => {
	let filtered = templates.value;

	// Apply search filter
	if (searchQuery.value.trim()) {
		const query = searchQuery.value.toLowerCase();
		filtered = filtered.filter(template =>
			template.name.toLowerCase().includes(query) ||
			convertHtmlToText(template.message).toLowerCase().includes(query) ||
			t(`messageTemplates.types.${template.type}`).toLowerCase().includes(query)
		);
	}

	// Apply type filter
	if (selectedTypeFilter.value !== 'all') {
		filtered = filtered.filter(template => template.type === selectedTypeFilter.value);
	}

	// Apply sorting
	filtered.sort((a, b) => {
		let aValue: string;
		let bValue: string;

		switch (sortField.value) {
			case 'name':
				aValue = a.name.toLowerCase();
				bValue = b.name.toLowerCase();
				break;
			case 'type':
				aValue = t(`messageTemplates.types.${a.type}`).toLowerCase();
				bValue = t(`messageTemplates.types.${b.type}`).toLowerCase();
				break;
			default:
				aValue = a.name.toLowerCase();
				bValue = b.name.toLowerCase();
		}

		if (sortDirection.value === 'asc') {
			return aValue > bValue ? 1 : -1;
		} else {
			return aValue < bValue ? 1 : -1;
		}
	});

	return filtered;
});

const availableTypes = computed(() => {
	const types = new Set(templates.value.map(t => t.type));
	return Array.from(types);
});

const toggleRowExpansion = (templateId: string) => {
	const newSet = new Set(expandedRows.value);
	if (newSet.has(templateId)) {
		newSet.delete(templateId);
	} else {
		newSet.add(templateId);
	}
	expandedRows.value = newSet;
};

const convertHtmlToText = (html: string): string => {
	return html
		.replace(/<[^>]*>/g, ' ') // Remove HTML tags
		.replace(/\s+/g, ' ') // Replace multiple spaces with single space
		.trim(); // Remove leading/trailing whitespace
};

const handleSort = (field: 'name' | 'type') => {
	if (sortField.value === field) {
		sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
	} else {
		sortField.value = field;
		sortDirection.value = 'asc';
	}
};

onMounted(async () => {
	await communityStore.fetchCommunity(props.id);
	await store.fetchTemplates(props.id);
	await communityStore.fetchMembers(props.id, 'active');
});

const openNewDialog = () => {
	currentTemplate.value = {
		scope: 'community',
		communityId: props.id,
	};
	isDialogOpen.value = true;
};

const openEditDialog = (template: MessageTemplate) => {
	currentTemplate.value = { ...template };
	isDialogOpen.value = true;
};

const handleDelete = async (id: string) => {
	if (confirm(t('messageTemplates.deleteConfirm'))) {
		await store.deleteTemplate(props.id, id);
	}
};

const handleTemplateSaved = () => {
	isDialogOpen.value = false;
	store.fetchTemplates(props.id);
};

const handleImportComplete = () => {
	isImportDialogOpen.value = false;
	store.fetchTemplates(props.id);
};
</script>

<template>
	<div class="p-4 md:p-8">
		<!-- Breadcrumb -->
		<div v-if="currentCommunity" class="flex items-center text-sm text-muted-foreground mb-4">
			<router-link :to="{ name: 'community-dashboard', params: { id: currentCommunity.id } }" class="hover:underline">
				{{ currentCommunity.name }}
			</router-link>
			<ChevronRight class="w-4 h-4 mx-1" />
			<span>{{ t('communityTemplates.title') }}</span>
		</div>

		<Card>
			<CardHeader class="flex flex-row items-center justify-between">
				<CardTitle>{{ t('communityTemplates.title') }}</CardTitle>
				<div class="flex gap-2">
					<Button
						variant="outline"
						@click="isImportDialogOpen = true"
					>
						<Download class="w-4 h-4 mr-2" />
						{{ t('communityTemplates.importTemplates') }}
					</Button>
					<Button @click="openNewDialog">
						{{ t('communityTemplates.addNew') }}
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				<div v-if="loading">{{ t('messageTemplates.loading') }}</div>
				<div v-else-if="error" class="text-red-500">{{ error }}</div>
				<div v-else class="space-y-4">
					<!-- Search and Filter Controls -->
					<div class="flex flex-col sm:flex-row gap-4 p-4 bg-muted/50 rounded-lg">
						<div class="flex-1">
							<div class="relative">
								<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
								<Input
									v-model="searchQuery"
									:placeholder="t('messageTemplates.dialog.searchPlaceholder')"
									class="pl-10"
								/>
							</div>
						</div>
						<div class="flex gap-2">
							<Select v-model="selectedTypeFilter">
								<SelectTrigger class="w-48">
									<SelectValue :placeholder="t('messageTemplates.types.all')" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{{ t('messageTemplates.types.all') }}</SelectItem>
									<SelectItem v-for="type in availableTypes" :key="type" :value="type">
										{{ t(`messageTemplates.types.${type}`) }}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<!-- Results Summary -->
					<div class="text-sm text-muted-foreground px-4">
						{{ filteredAndSortedTemplates.length }} {{ filteredAndSortedTemplates.length === 1 ? 'plantilla' : 'plantillas' }} encontrada{{ filteredAndSortedTemplates.length === 1 ? '' : 's' }}
					</div>

					<!-- Enhanced Table -->
					<div class="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead
										class="cursor-pointer hover:bg-muted/50 transition-colors"
										@click="handleSort('name')"
									>
										<div class="flex items-center gap-2">
											{{ t('messageTemplates.table.name') }}
											<ChevronUp
												v-if="sortField === 'name' && sortDirection === 'asc'"
												class="w-4 h-4"
											/>
											<ChevronDown
												v-else-if="sortField === 'name' && sortDirection === 'desc'"
												class="w-4 h-4"
											/>
										</div>
									</TableHead>
									<TableHead
										class="cursor-pointer hover:bg-muted/50 transition-colors"
										@click="handleSort('type')"
									>
										<div class="flex items-center gap-2">
											{{ t('messageTemplates.table.type') }}
											<ChevronUp
												v-if="sortField === 'type' && sortDirection === 'asc'"
												class="w-4 h-4"
											/>
											<ChevronDown
												v-else-if="sortField === 'type' && sortDirection === 'desc'"
												class="w-4 h-4"
											/>
										</div>
									</TableHead>
									<TableHead>{{ t('messageTemplates.table.message') }}</TableHead>
									<TableHead class="text-right">{{ t('messageTemplates.table.actions') }}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								<template v-for="template in filteredAndSortedTemplates" :key="template.id">
									<TableRow
										class="hover:bg-muted/30 transition-colors"
										:class="{ 'bg-muted/20': expandedRows.has(template.id) }"
									>
										<TableCell class="font-medium">{{ template.name }}</TableCell>
										<TableCell>
											<Badge variant="secondary" class="text-xs">
												{{ t(`messageTemplates.types.${template.type}`) }}
											</Badge>
										</TableCell>
										<TableCell class="max-w-xs">
											<div class="flex items-start gap-2">
												<div class="flex-1 min-w-0">
													<div class="text-sm truncate">
														{{ convertHtmlToText(template.message) }}
													</div>
													<div
														v-if="convertHtmlToText(template.message).length > 100"
														class="text-xs text-muted-foreground cursor-pointer hover:text-primary mt-1"
														@click="toggleRowExpansion(template.id)"
													>
														{{ expandedRows.has(template.id) ? t('common.actions.showLess') : t('common.actions.showMore') }}
													</div>
												</div>
												<Button
													v-if="convertHtmlToText(template.message).length > 100"
													variant="ghost"
													size="sm"
													@click="toggleRowExpansion(template.id)"
													class="h-6 w-6 p-0 flex-shrink-0"
												>
													<ChevronDown
														v-if="!expandedRows.has(template.id)"
														class="w-4 h-4 transition-transform"
													/>
													<ChevronUp
														v-else
														class="w-4 h-4 transition-transform"
													/>
												</Button>
											</div>
										</TableCell>
										<TableCell class="text-right">
											<div class="flex items-center justify-end gap-1">
												<Button
													variant="ghost"
													size="sm"
													@click="openEditDialog(template)"
													class="h-8 w-8 p-0"
													:title="t('common.edit')"
												>
													<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
													</svg>
												</Button>
												<Button
													variant="ghost"
													size="sm"
													class="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
													@click="handleDelete(template.id)"
													:title="t('common.delete')"
												>
													<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
													</svg>
												</Button>
											</div>
										</TableCell>
									</TableRow>
									<!-- Expanded Row for Full Message -->
									<TableRow
										v-if="expandedRows.has(template.id)"
										:key="`${template.id}-expanded`"
										class="bg-muted/10"
									>
										<TableCell colspan="4" class="p-4">
											<div class="space-y-2">
												<div class="text-sm font-medium text-muted-foreground">Mensaje completo:</div>
												<div class="bg-background border rounded-md p-3 text-sm font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
													{{ convertHtmlToText(template.message) }}
												</div>
												<div class="flex items-center justify-between text-xs text-muted-foreground">
													<span>{{ convertHtmlToText(template.message).length }} caracteres</span>
													<span>Creado: {{ new Date(template.createdAt).toLocaleString('es-ES') }}</span>
												</div>
											</div>
										</TableCell>
									</TableRow>
								</template>
							</TableBody>
						</Table>

						<!-- Empty State -->
						<div v-if="filteredAndSortedTemplates.length === 0 && !loading" class="text-center py-12 text-muted-foreground">
							<div class="mb-4">
								<svg class="w-12 h-12 mx-auto text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
							</div>
							<div class="text-lg font-medium mb-2">
								{{ searchQuery || selectedTypeFilter !== 'all' ? 'No se encontraron plantillas' : 'Aún no hay plantillas' }}
							</div>
							<div class="text-sm">
								{{ searchQuery || selectedTypeFilter !== 'all' ? 'Intenta ajustar tus filtros de búsqueda' : 'Importa plantillas existentes o crea tu primera plantilla' }}
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>

		<BaseMessageTemplateModal
			v-model:open="isDialogOpen"
			:template="currentTemplate"
			:is-global="false"
			:participants="formattedMembers"
			@saved="handleTemplateSaved"
		/>

		<CommunityTemplateImportModal
			v-model:open="isImportDialogOpen"
			:community-id="props.id"
			@complete="handleImportComplete"
		/>
	</div>
</template>
