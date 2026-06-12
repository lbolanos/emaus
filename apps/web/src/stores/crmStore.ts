import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { CrmTask, ParticipantFollowUp, FollowUpStatus } from '@repo/types';
import {
	getFollowUps,
	upsertFollowUp,
	getCrmTasks,
	createCrmTask,
	updateCrmTask,
	deleteCrmTask,
} from '@/services/api';

type FollowUpRow = ParticipantFollowUp & { participant?: any };
type TaskRow = CrmTask & { participant?: any; assignee?: any };

/** Pipeline de seguimiento + tareas/recordatorios del coordinador. */
export const useCrmStore = defineStore('crm', () => {
	const followUps = ref<FollowUpRow[]>([]);
	const tasks = ref<TaskRow[]>([]);
	const loading = ref(false);

	const fetchFollowUps = async (retreatId: string) => {
		followUps.value = await getFollowUps(retreatId);
	};

	const setFollowUp = async (data: {
		retreatId: string;
		participantId: string;
		status: FollowUpStatus;
		note?: string | null;
	}) => {
		await upsertFollowUp(data);
		await fetchFollowUps(data.retreatId);
	};

	const fetchTasks = async (retreatId: string) => {
		loading.value = true;
		try {
			tasks.value = await getCrmTasks(retreatId);
		} finally {
			loading.value = false;
		}
	};

	const addTask = async (data: {
		retreatId: string;
		participantId?: string | null;
		title: string;
		description?: string | null;
		dueDate?: string | null;
	}) => {
		await createCrmTask(data);
		await fetchTasks(data.retreatId);
	};

	const toggleTask = async (task: TaskRow) => {
		const next = task.status === 'done' ? 'open' : 'done';
		const updated = await updateCrmTask(task.id, { status: next });
		const idx = tasks.value.findIndex((t) => t.id === task.id);
		if (idx !== -1) tasks.value[idx] = { ...tasks.value[idx], ...updated };
	};

	const removeTask = async (id: string) => {
		await deleteCrmTask(id);
		tasks.value = tasks.value.filter((t) => t.id !== id);
	};

	return {
		followUps,
		tasks,
		loading,
		fetchFollowUps,
		setFollowUp,
		fetchTasks,
		addTask,
		toggleTask,
		removeTask,
	};
});
