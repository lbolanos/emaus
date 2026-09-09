import { defineStore } from 'pinia';
import { ref } from 'vue';
import type {
	CrmTask,
	ParticipantFollowUp,
	FollowUpStatus,
	ParticipantNote,
	TimelineEvent,
} from '@repo/types';
import {
	getFollowUps,
	upsertFollowUp,
	getCrmTasks,
	createCrmTask,
	updateCrmTask,
	deleteCrmTask,
	getParticipantNotes,
	getParticipantTimeline,
	createParticipantNote,
	updateParticipantNote,
	deleteParticipantNote,
} from '@/services/api';

type FollowUpRow = ParticipantFollowUp & { participant?: any };
type TaskRow = CrmTask & { participant?: any; assignee?: any };
type NoteRow = ParticipantNote & { author?: any };

/** Pipeline de seguimiento, tareas del coordinador e hilo por participante. */
export const useCrmStore = defineStore('crm', () => {
	const followUps = ref<FollowUpRow[]>([]);
	const tasks = ref<TaskRow[]>([]);
	const notes = ref<NoteRow[]>([]);
	const timeline = ref<TimelineEvent[]>([]);
	const loading = ref(false);
	const timelineLoading = ref(false);

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

	// --- Hilo de notas y timeline ---

	/**
	 * Carga hilo y timeline del participante abierto en el panel.
	 * El timeline ya incluye las notas, pero `notes` se mantiene aparte porque
	 * la caja de edición necesita el registro crudo (con `kind` y autor) para
	 * decidir qué se puede editar.
	 */
	const fetchThread = async (retreatId: string, participantId: string) => {
		timelineLoading.value = true;
		try {
			const [n, t] = await Promise.all([
				getParticipantNotes(retreatId, participantId),
				getParticipantTimeline(retreatId, participantId),
			]);
			notes.value = n;
			timeline.value = t;
		} finally {
			timelineLoading.value = false;
		}
	};

	const clearThread = () => {
		notes.value = [];
		timeline.value = [];
	};

	const addNote = async (data: {
		retreatId: string;
		participantId: string;
		body: string;
	}) => {
		await createParticipantNote(data);
		await fetchThread(data.retreatId, data.participantId);
	};

	const editNote = async (
		id: string,
		body: string,
		ctx: { retreatId: string; participantId: string },
	) => {
		await updateParticipantNote(id, body);
		await fetchThread(ctx.retreatId, ctx.participantId);
	};

	const removeNote = async (
		id: string,
		ctx: { retreatId: string; participantId: string },
	) => {
		await deleteParticipantNote(id);
		await fetchThread(ctx.retreatId, ctx.participantId);
	};

	return {
		followUps,
		tasks,
		notes,
		timeline,
		loading,
		timelineLoading,
		fetchFollowUps,
		setFollowUp,
		fetchTasks,
		addTask,
		toggleTask,
		removeTask,
		fetchThread,
		clearThread,
		addNote,
		editNote,
		removeNote,
	};
});
