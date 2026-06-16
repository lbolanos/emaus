<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useToast, Button, Input } from '@repo/ui';
import { Plus, Trash2, Check, Clock } from 'lucide-vue-next';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useCrmStore } from '@/stores/crmStore';
import type { FollowUpStatus } from '@repo/types';

const { t } = useI18n();
const { toast } = useToast();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const crmStore = useCrmStore();

const { tasks, followUps } = storeToRefs(crmStore);
const { participants } = storeToRefs(participantStore);

const retreatId = computed(() => retreatStore.selectedRetreatId || '');

const FOLLOW_STATUSES: FollowUpStatus[] = ['pending', 'contacted', 'confirmed', 'no_answer', 'declined'];

// --- Tareas ---
const newTaskTitle = ref('');
const newTaskDue = ref('');

// --- Pipeline ---
const fuParticipantId = ref('');
const fuStatus = ref<FollowUpStatus>('contacted');
const fuNote = ref('');

async function load() {
	if (!retreatId.value) return;
	participantStore.filters.retreatId = retreatId.value;
	await Promise.all([
		crmStore.fetchTasks(retreatId.value),
		crmStore.fetchFollowUps(retreatId.value),
		participantStore.fetchParticipants(),
	]);
}

onMounted(load);
watch(retreatId, load);

async function addTask() {
	if (!newTaskTitle.value.trim() || !retreatId.value) return;
	try {
		await crmStore.addTask({
			retreatId: retreatId.value,
			title: newTaskTitle.value.trim(),
			dueDate: newTaskDue.value || null,
		});
		newTaskTitle.value = '';
		newTaskDue.value = '';
	} catch {
		toast({ title: t('followUp.taskError'), variant: 'destructive' });
	}
}

async function saveFollowUp() {
	if (!fuParticipantId.value || !retreatId.value) return;
	try {
		await crmStore.setFollowUp({
			retreatId: retreatId.value,
			participantId: fuParticipantId.value,
			status: fuStatus.value,
			note: fuNote.value || null,
		});
		fuNote.value = '';
		toast({ title: t('followUp.saved') });
	} catch {
		toast({ title: t('followUp.saveError'), variant: 'destructive' });
	}
}

function participantName(p: any): string {
	return `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim();
}
</script>

<template>
	<div class="p-4 space-y-8">
		<div>
			<h1 class="text-2xl font-semibold">{{ t('followUp.title') }}</h1>
			<p class="text-gray-600 text-sm">{{ t('followUp.subtitle') }}</p>
		</div>

		<!-- Tareas -->
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">{{ t('followUp.tasksTitle') }}</h2>
			<div class="flex flex-wrap gap-2 items-end">
				<div class="flex-1 min-w-[200px]">
					<label class="text-xs text-gray-500">{{ t('followUp.taskTitle') }}</label>
					<Input v-model="newTaskTitle" :placeholder="t('followUp.taskPlaceholder')" @keyup.enter="addTask" />
				</div>
				<div>
					<label class="text-xs text-gray-500">{{ t('followUp.dueDate') }}</label>
					<input type="datetime-local" v-model="newTaskDue" class="block p-2 border rounded-md text-sm" />
				</div>
				<Button :disabled="!newTaskTitle.trim()" @click="addTask">
					<Plus class="w-4 h-4 mr-1" /> {{ t('followUp.addTask') }}
				</Button>
			</div>

			<div v-if="tasks.length" class="border rounded-md divide-y">
				<div v-for="task in tasks" :key="task.id" class="flex items-center gap-3 p-3">
					<button
						class="w-5 h-5 rounded border flex items-center justify-center shrink-0"
						:class="task.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'"
						@click="crmStore.toggleTask(task)"
					>
						<Check v-if="task.status === 'done'" class="w-3.5 h-3.5" />
					</button>
					<div class="min-w-0 flex-1">
						<div class="text-sm" :class="{ 'line-through text-gray-400': task.status === 'done' }">
							{{ task.title }}
						</div>
						<div v-if="task.dueDate" class="text-xs text-gray-500 flex items-center gap-1">
							<Clock class="w-3 h-3" /> {{ new Date(task.dueDate as any).toLocaleString() }}
							<span v-if="task.participant"> · {{ participantName(task.participant) }}</span>
						</div>
					</div>
					<Button variant="ghost" size="icon" class="text-red-500" @click="crmStore.removeTask(task.id)">
						<Trash2 class="w-4 h-4" />
					</Button>
				</div>
			</div>
			<p v-else class="text-sm text-gray-500">{{ t('followUp.noTasks') }}</p>
		</section>

		<!-- Pipeline de seguimiento -->
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">{{ t('followUp.pipelineTitle') }}</h2>
			<div class="flex flex-wrap gap-2 items-end border rounded-md p-3 bg-gray-50">
				<div class="flex-1 min-w-[180px]">
					<label class="text-xs text-gray-500">{{ t('followUp.participant') }}</label>
					<select v-model="fuParticipantId" class="w-full p-2 border rounded-md text-sm">
						<option value="">{{ t('followUp.selectParticipant') }}</option>
						<option v-for="p in participants" :key="p.id" :value="p.id">{{ participantName(p) }}</option>
					</select>
				</div>
				<div>
					<label class="text-xs text-gray-500">{{ t('followUp.status') }}</label>
					<select v-model="fuStatus" class="p-2 border rounded-md text-sm">
						<option v-for="s in FOLLOW_STATUSES" :key="s" :value="s">{{ t('followUp.statuses.' + s) }}</option>
					</select>
				</div>
				<div class="flex-1 min-w-[160px]">
					<label class="text-xs text-gray-500">{{ t('followUp.note') }}</label>
					<Input v-model="fuNote" :placeholder="t('followUp.notePlaceholder')" />
				</div>
				<Button :disabled="!fuParticipantId" @click="saveFollowUp">{{ t('followUp.save') }}</Button>
			</div>

			<div v-if="followUps.length" class="border rounded-md divide-y">
				<div v-for="fu in followUps" :key="fu.id" class="flex items-center justify-between gap-3 p-3">
					<div class="min-w-0">
						<div class="text-sm font-medium truncate">{{ participantName(fu.participant) }}</div>
						<div v-if="fu.note" class="text-xs text-gray-500 truncate">{{ fu.note }}</div>
					</div>
					<span
						class="text-xs rounded px-2 py-0.5 shrink-0"
						:class="{
							'bg-gray-200 text-gray-700': fu.status === 'pending',
							'bg-blue-100 text-blue-700': fu.status === 'contacted',
							'bg-green-100 text-green-700': fu.status === 'confirmed',
							'bg-amber-100 text-amber-700': fu.status === 'no_answer',
							'bg-red-100 text-red-700': fu.status === 'declined',
						}"
					>
						{{ t('followUp.statuses.' + fu.status) }}
					</span>
				</div>
			</div>
			<p v-else class="text-sm text-gray-500">{{ t('followUp.noFollowUps') }}</p>
		</section>
	</div>
</template>
