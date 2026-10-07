import { AppDataSource } from '../data-source';
import { GlobalMessageSequence } from '../entities/globalMessageSequence.entity';
import { GlobalSequenceStep } from '../entities/globalSequenceStep.entity';
import { MessageSequence } from '../entities/messageSequence.entity';
import type { MessageChannel, MessageRecipientTarget } from '../entities/sequenceStep.entity';
import { messageSequenceService } from './messageSequenceService';
import { findDefaultTemplateForType } from './messageTemplateService';
import { domainAuditService, DomainAuditAction } from './domainAuditService';

/** Campos con traza de auditoría de una plantilla global (sin retiro asociado). */
const GLOBAL_SEQ_AUDIT_FIELDS = ['name', 'trigger', 'audience', 'isActive', 'maxOverdueDays'];

/** Paso recibido al crear/editar una plantilla global. */
type GlobalStepInput = {
	stepOrder?: number;
	offsetDays?: number;
	sendHour?: number;
	templateType: string;
	channel: MessageChannel;
	recipientTarget?: MessageRecipientTarget;
	recipientResponsibility?: string | null;
	condition?: Record<string, unknown> | null;
};

/**
 * Plantillas globales de secuencias (drip) reutilizables en cualquier retiro.
 * Espeja `globalMessageTemplateService`: CRUD + `copyToRetreat`, que clona la
 * secuencia dentro del retiro destino (inactiva).
 */
export class GlobalMessageSequenceService {
	async getAll(): Promise<GlobalMessageSequence[]> {
		return AppDataSource.getRepository(GlobalMessageSequence).find({
			relations: ['steps'],
			order: { createdAt: 'DESC' },
		});
	}

	async getById(id: string): Promise<GlobalMessageSequence | null> {
		return AppDataSource.getRepository(GlobalMessageSequence).findOne({
			where: { id },
			relations: ['steps'],
		});
	}

	async create(input: {
		name: string;
		description?: string | null;
		trigger: GlobalMessageSequence['trigger'];
		audience?: GlobalMessageSequence['audience'];
		isActive?: boolean;
		maxOverdueDays?: number | null;
		steps?: GlobalStepInput[];
	}): Promise<GlobalMessageSequence> {
		const repo = AppDataSource.getRepository(GlobalMessageSequence);
		const seq = await repo.save(
			repo.create({
				name: input.name,
				description: input.description ?? null,
				trigger: input.trigger,
				audience: input.audience ?? 'all',
				isActive: input.isActive ?? true,
				maxOverdueDays: input.maxOverdueDays ?? null,
			}),
		);
		await this.syncSteps(seq.id, input.steps ?? []);
		void domainAuditService.logCreate('global_message_sequence', seq.id, seq, {
			fields: GLOBAL_SEQ_AUDIT_FIELDS,
			metadata: { stepCount: input.steps?.length ?? 0 },
		});
		return (await this.getById(seq.id))!;
	}

	async update(
		id: string,
		input: {
			name?: string;
			description?: string | null;
			trigger?: GlobalMessageSequence['trigger'];
			audience?: GlobalMessageSequence['audience'];
			isActive?: boolean;
			maxOverdueDays?: number | null;
			steps?: GlobalStepInput[];
		},
	): Promise<GlobalMessageSequence | null> {
		const repo = AppDataSource.getRepository(GlobalMessageSequence);
		const seq = await repo.findOne({ where: { id } });
		if (!seq) return null;
		const beforeAudit = {
			name: seq.name,
			trigger: seq.trigger,
			audience: seq.audience,
			isActive: seq.isActive,
			maxOverdueDays: seq.maxOverdueDays,
		};
		if (input.name !== undefined) seq.name = input.name;
		if (input.description !== undefined) seq.description = input.description;
		if (input.trigger !== undefined) seq.trigger = input.trigger;
		if (input.audience !== undefined) seq.audience = input.audience;
		if (input.isActive !== undefined) seq.isActive = input.isActive;
		if (input.maxOverdueDays !== undefined) seq.maxOverdueDays = input.maxOverdueDays;
		await repo.save(seq);
		if (input.steps !== undefined) await this.syncSteps(id, input.steps);
		void domainAuditService.logUpdate('global_message_sequence', id, beforeAudit, seq, {
			fields: GLOBAL_SEQ_AUDIT_FIELDS,
			metadata: {
				...(input.steps !== undefined ? { stepCount: input.steps.length } : {}),
			},
		});
		return this.getById(id);
	}

	async delete(id: string): Promise<boolean> {
		const repo = AppDataSource.getRepository(GlobalMessageSequence);
		const seq = await repo.findOne({ where: { id } });
		if (!seq) return false;
		const result = await repo.delete(id);
		const deleted = (result.affected ?? 0) > 0;
		if (deleted) {
			void domainAuditService.logDelete('global_message_sequence', id, seq, {
				fields: GLOBAL_SEQ_AUDIT_FIELDS,
			});
		}
		return deleted;
	}

	async toggleActive(id: string): Promise<GlobalMessageSequence | null> {
		const repo = AppDataSource.getRepository(GlobalMessageSequence);
		const seq = await repo.findOne({ where: { id } });
		if (!seq) return null;
		const wasActive = seq.isActive;
		seq.isActive = !seq.isActive;
		await repo.save(seq);
		void domainAuditService.logUpdate(
			'global_message_sequence',
			id,
			{ isActive: wasActive },
			{ isActive: seq.isActive },
			{
				fields: ['isActive'],
				action: DomainAuditAction.GLOBAL_MESSAGE_SEQUENCE_TOGGLE_ACTIVE,
			},
		);
		return this.getById(id);
	}

	/** Reemplaza los pasos de la plantilla global por los recibidos. */
	private async syncSteps(sequenceId: string, steps: GlobalStepInput[]): Promise<void> {
		const stepRepo = AppDataSource.getRepository(GlobalSequenceStep);
		await stepRepo.delete({ sequenceId });
		if (!steps.length) return;
		await stepRepo.save(
			steps.map((s, i) =>
				stepRepo.create({
					sequenceId,
					stepOrder: s.stepOrder ?? i,
					offsetDays: s.offsetDays ?? 0,
					sendHour: s.sendHour ?? 9,
					templateType: s.templateType,
					channel: s.channel,
					recipientTarget: s.recipientTarget ?? 'participant',
					recipientResponsibility: s.recipientResponsibility ?? null,
					condition: s.condition ?? null,
				}),
			),
		);
	}

	/**
	 * Importa una plantilla global a un retiro: crea una `MessageSequence` clon
	 * (INACTIVA) con sus pasos. Reutiliza `messageSequenceService.createSequence`.
	 * Devuelve la secuencia creada, o null si la plantilla global no existe.
	 */
	async copyToRetreat(
		globalSequenceId: string,
		retreatId: string,
		createdBy?: string | null,
	): Promise<MessageSequence | null> {
		const global = await this.getById(globalSequenceId);
		if (!global) return null;
		// M3: los pasos globales no tienen plantilla propia (son por tipo), así
		// que al aterrizar en el retiro se fijan a la plantilla local de su tipo
		// (createdAt ASC, el mismo fallback del motor) — el clon queda explícito
		// y sobrevive a que después se creen más plantillas de ese tipo.
		// M6: the local template is the type's "predeterminada", else the oldest.
		const localTemplateByType = new Map<string, string>();
		for (const type of new Set((global.steps ?? []).map((s) => s.templateType))) {
			const local = await findDefaultTemplateForType(retreatId, type);
			if (local) localTemplateByType.set(type, local.id);
		}
		const steps = (global.steps ?? [])
			.slice()
			.sort((a, b) => a.stepOrder - b.stepOrder)
			.map((s) => ({
				stepOrder: s.stepOrder,
				offsetDays: s.offsetDays,
				sendHour: s.sendHour,
				templateType: s.templateType,
				templateId: localTemplateByType.get(s.templateType) ?? null,
				channel: s.channel,
				recipientTarget: s.recipientTarget,
				recipientResponsibility: s.recipientResponsibility ?? null,
				condition: s.condition ?? null,
			}));
		const created = await messageSequenceService.createSequence({
			name: global.name,
			description: global.description ?? null,
			retreatId,
			trigger: global.trigger,
			audience: global.audience,
			isActive: false, // importada inactiva: el coordinador la revisa y activa
			maxOverdueDays: global.maxOverdueDays ?? null,
			createdBy: createdBy ?? null,
			steps,
			clonedFrom: globalSequenceId,
		});
		void domainAuditService.log({
			action: DomainAuditAction.GLOBAL_MESSAGE_SEQUENCE_COPY_TO_RETREAT,
			resourceType: 'global_message_sequence',
			resourceId: globalSequenceId,
			retreatId,
			metadata: { createdSequenceId: created.id, name: global.name },
		});
		return created;
	}
}

export const globalMessageSequenceService = new GlobalMessageSequenceService();
