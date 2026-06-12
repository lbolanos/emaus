import { AppDataSource } from '../data-source';
import { ParticipantFollowUp, FollowUpStatus } from '../entities/participantFollowUp.entity';
import { CrmTask } from '../entities/crmTask.entity';

/**
 * Pipeline de seguimiento de participantes + tareas/recordatorios del
 * coordinador.
 */
export class CrmService {
	// --- Follow-up (pipeline de seguimiento) ---

	async listFollowUps(retreatId: string): Promise<ParticipantFollowUp[]> {
		return AppDataSource.getRepository(ParticipantFollowUp).find({
			where: { retreatId },
			relations: ['participant'],
			order: { updatedAt: 'DESC' },
		});
	}

	/** Crea o actualiza el estado de seguimiento de un participante (upsert). */
	async upsertFollowUp(input: {
		retreatId: string;
		participantId: string;
		status: FollowUpStatus;
		note?: string | null;
		updatedBy?: string | null;
	}): Promise<ParticipantFollowUp> {
		const repo = AppDataSource.getRepository(ParticipantFollowUp);
		let row = await repo.findOne({
			where: { retreatId: input.retreatId, participantId: input.participantId },
		});
		if (!row) {
			row = repo.create({ retreatId: input.retreatId, participantId: input.participantId });
		}
		row.status = input.status;
		row.note = input.note ?? null;
		row.updatedBy = input.updatedBy ?? null;
		return repo.save(row);
	}

	// --- Tareas / recordatorios ---

	async listTasks(retreatId: string, status?: 'open' | 'done'): Promise<CrmTask[]> {
		const where: Record<string, unknown> = { retreatId };
		if (status) where.status = status;
		return AppDataSource.getRepository(CrmTask).find({
			where,
			relations: ['participant', 'assignee'],
			order: { dueDate: 'ASC', createdAt: 'DESC' },
		});
	}

	async createTask(input: {
		retreatId: string;
		participantId?: string | null;
		title: string;
		description?: string | null;
		dueDate?: string | null;
		assignedTo?: string | null;
		createdBy?: string | null;
	}): Promise<CrmTask> {
		const repo = AppDataSource.getRepository(CrmTask);
		const task = repo.create({
			retreatId: input.retreatId,
			participantId: input.participantId ?? null,
			title: input.title,
			description: input.description ?? null,
			dueDate: input.dueDate ? new Date(input.dueDate) : null,
			status: 'open',
			assignedTo: input.assignedTo ?? null,
			createdBy: input.createdBy ?? null,
		});
		return repo.save(task);
	}

	async findTaskById(id: string): Promise<CrmTask | null> {
		return AppDataSource.getRepository(CrmTask).findOne({ where: { id } });
	}

	async updateTask(
		id: string,
		input: {
			title?: string;
			description?: string | null;
			dueDate?: string | null;
			status?: 'open' | 'done';
			assignedTo?: string | null;
		},
	): Promise<CrmTask | null> {
		const repo = AppDataSource.getRepository(CrmTask);
		const task = await repo.findOne({ where: { id } });
		if (!task) return null;
		if (input.title !== undefined) task.title = input.title;
		if (input.description !== undefined) task.description = input.description;
		if (input.dueDate !== undefined) task.dueDate = input.dueDate ? new Date(input.dueDate) : null;
		if (input.assignedTo !== undefined) task.assignedTo = input.assignedTo;
		if (input.status !== undefined) {
			task.status = input.status;
			task.completedAt = input.status === 'done' ? new Date() : null;
		}
		return repo.save(task);
	}

	async deleteTask(id: string): Promise<boolean> {
		const result = await AppDataSource.getRepository(CrmTask).delete(id);
		return (result.affected ?? 0) > 0;
	}
}

export const crmService = new CrmService();
