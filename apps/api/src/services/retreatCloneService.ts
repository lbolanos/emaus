import { In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { Responsability } from '../entities/responsability.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { ServiceTeam } from '../entities/serviceTeam.entity';
import { ServiceTeamMember } from '../entities/serviceTeamMember.entity';
import { RetreatShirtType } from '../entities/retreatShirtType.entity';
import { RetreatShirtTypeSizePrice } from '../entities/retreatShirtTypeSizePrice.entity';
import { RetreatInventory } from '../entities/retreatInventory.entity';
import { RetreatInventoryHistory } from '../entities/retreatInventoryHistory.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { MessageSequence } from '../entities/messageSequence.entity';
import { domainAuditService } from './domainAuditService';
import { messageSequenceService } from './messageSequenceService';
import { retreatScheduleService } from './retreatScheduleService';
import { retreatPreRetreatTaskService } from './retreatPreRetreatTaskService';
import { computeIsSufficient } from './inventoryService';
import { DomainAuditAction, type RetreatCloneResult, type RetreatCloneSections } from '@repo/types';

/** Error con status HTTP para que el controller lo traduzca sin adivinar. */
export class RetreatCloneError extends Error {
	constructor(
		message: string,
		public readonly statusCode: number,
	) {
		super(message);
		this.name = 'RetreatCloneError';
	}
}

/**
 * Copia secciones configurables de un retiro anterior a uno recién creado.
 *
 * Cada sección seleccionada REEMPLAZA lo que `retreatService.createRetreat`
 * sembró por defecto (delete + copy) para no dejar duplicados; las no
 * seleccionadas conservan los defaults. El orden importa:
 *   responsibilities → … → schedule  (el MAM remapea responsabilityId por nombre)
 *   shirtTypes → inventory           (las filas de inventario de playera remapean el tipo)
 *   messageTemplates → messageSequences (los pasos remapean templateId)
 *
 * NO se copia nunca: participantes, pagos, asignaciones (mesas/camas/
 * responsables), inscripciones de Santísimo, mensajes programados, recuerdos.
 * Sin transacción global, igual que `createRetreat`: cada sección es secuencial
 * y el resultado reporta los counts de lo que alcanzó a copiarse.
 */
export const cloneFromRetreat = async (
	targetRetreatId: string,
	sourceRetreatId: string,
	sections: RetreatCloneSections,
	actorId?: string,
): Promise<RetreatCloneResult> => {
	if (sourceRetreatId === targetRetreatId) {
		throw new RetreatCloneError('El retiro origen y destino no pueden ser el mismo.', 400);
	}

	const retreatRepo = AppDataSource.getRepository(Retreat);
	const [target, source] = await Promise.all([
		retreatRepo.findOne({ where: { id: targetRetreatId } }),
		retreatRepo.findOne({ where: { id: sourceRetreatId } }),
	]);
	if (!target) throw new RetreatCloneError('Retiro destino no encontrado.', 404);
	if (!source) throw new RetreatCloneError('Retiro origen no encontrado.', 404);

	// Clonar sobre un retiro con gente inscrita pisaría configuración en uso:
	// los defaults ya se editaron y hay datos vivos colgando de ellos.
	const retreatParticipantRepo = AppDataSource.getRepository(RetreatParticipant);
	const activeParticipants = await retreatParticipantRepo.count({
		where: { retreatId: targetRetreatId, isCancelled: false },
	});
	if (activeParticipants > 0) {
		throw new RetreatCloneError(
			'Solo se puede copiar configuración en un retiro sin participantes inscritos.',
			409,
		);
	}

	const warnings: string[] = [];
	const result: RetreatCloneResult = {
		sourceRetreatId,
		targetRetreatId,
		warnings,
		sections: {
			tables: 0,
			responsibilities: 0,
			schedule: 0,
			preRetreatTasks: 0,
			inventory: 0,
			shirtTypes: 0,
			messageTemplates: 0,
			messageSequences: 0,
			serviceTeams: 0,
			sequenceSteps: 0,
			santisimoSlots: 0,
		},
	};

	// --- 1. Responsabilidades (catálogo, SIN participantes asignados) ---
	if (sections.responsibilities) {
		const repo = AppDataSource.getRepository(Responsability);
		await repo.delete({ retreatId: targetRetreatId });
		const sourceRows = await repo.find({
			where: { retreatId: sourceRetreatId },
			order: { priority: 'ASC', name: 'ASC' },
		});
		for (const r of sourceRows) {
			await repo.save(
				repo.create({
					retreatId: targetRetreatId,
					name: r.name,
					description: r.description,
					responsabilityType: r.responsabilityType,
					isLeadership: r.isLeadership,
					priority: r.priority,
					isActive: r.isActive,
				}),
			);
		}
		result.sections.responsibilities = sourceRows.length;
	}

	// --- 2. Mesas (solo estructura: nombres, SIN líderes ni foto) ---
	if (sections.tables) {
		const repo = AppDataSource.getRepository(TableMesa);
		await repo.delete({ retreatId: targetRetreatId });
		const sourceRows = await repo.find({
			where: { retreatId: sourceRetreatId },
			order: { name: 'ASC' },
		});
		for (const t of sourceRows) {
			await repo.save(repo.create({ retreatId: targetRetreatId, name: t.name }));
		}
		result.sections.tables = sourceRows.length;
	}

	// --- 3. Equipos de servicio (estructura, SIN líder ni miembros) ---
	if (sections.serviceTeams) {
		const teamRepo = AppDataSource.getRepository(ServiceTeam);
		const memberRepo = AppDataSource.getRepository(ServiceTeamMember);
		const targetTeams = await teamRepo.find({
			where: { retreatId: targetRetreatId },
			select: ['id'],
		});
		if (targetTeams.length) {
			await memberRepo.delete({ serviceTeamId: In(targetTeams.map((t) => t.id)) });
		}
		await teamRepo.delete({ retreatId: targetRetreatId });
		const sourceRows = await teamRepo.find({
			where: { retreatId: sourceRetreatId },
			order: { priority: 'ASC', name: 'ASC' },
		});
		for (const t of sourceRows) {
			await teamRepo.save(
				teamRepo.create({
					retreatId: targetRetreatId,
					name: t.name,
					teamType: t.teamType,
					description: t.description,
					instructions: t.instructions,
					priority: t.priority,
					isActive: t.isActive,
				}),
			);
		}
		result.sections.serviceTeams = sourceRows.length;
	}

	// --- 4. Tallas de playera (+ precios por talla; participant_shirt_size
	//        cae por CASCADE al borrar el tipo) ---
	const shirtTypeIdMap = new Map<string, string>();
	if (sections.shirtTypes) {
		const typeRepo = AppDataSource.getRepository(RetreatShirtType);
		const priceRepo = AppDataSource.getRepository(RetreatShirtTypeSizePrice);
		await typeRepo.delete({ retreatId: targetRetreatId });
		const sourceRows = await typeRepo.find({
			where: { retreatId: sourceRetreatId },
			order: { sortOrder: 'ASC', name: 'ASC' },
		});
		const sourceIds = sourceRows.map((t) => t.id);
		const sourcePrices = sourceIds.length
			? await priceRepo.find({ where: { shirtTypeId: In(sourceIds) } })
			: [];
		const pricesByType = new Map<string, RetreatShirtTypeSizePrice[]>();
		for (const p of sourcePrices) {
			const list = pricesByType.get(p.shirtTypeId) ?? [];
			list.push(p);
			pricesByType.set(p.shirtTypeId, list);
		}
		for (const t of sourceRows) {
			const saved = await typeRepo.save(
				typeRepo.create({
					retreatId: targetRetreatId,
					name: t.name,
					color: t.color ?? null,
					requiredForWalkers: t.requiredForWalkers,
					optionalForServers: t.optionalForServers,
					sortOrder: t.sortOrder,
					availableSizes: t.availableSizes ?? null,
					price: t.price ?? null,
				}),
			);
			shirtTypeIdMap.set(t.id, saved.id);
			for (const p of pricesByType.get(t.id) ?? []) {
				await priceRepo.save(
					priceRepo.create({
						shirtTypeId: saved.id,
						size: p.size,
						price: p.price,
					}),
				);
			}
		}
		result.sections.shirtTypes = sourceRows.length;
	}

	// --- 5. Inventario (lo requerido/notas/caja del origen; existencias en 0) ---
	if (sections.inventory) {
		const invRepo = AppDataSource.getRepository(RetreatInventory);
		const histRepo = AppDataSource.getRepository(RetreatInventoryHistory);
		const targetRows = await invRepo.find({
			where: { retreatId: targetRetreatId },
			select: ['id'],
		});
		if (targetRows.length) {
			// La history referencia la fila pivote; sin esto el DELETE cae en FK.
			await histRepo.delete({ retreatInventoryId: In(targetRows.map((r) => r.id)) });
		}
		await invRepo.delete({ retreatId: targetRetreatId });

		const sourceRows = await invRepo.find({
			where: { retreatId: sourceRetreatId },
		});
		for (const row of sourceRows) {
			// Filas de playera: solo tienen sentido con el tipo de playera del
			// origen, que pudo no copiarse (sección tallas apagada).
			if (row.retreatShirtTypeId) {
				const mappedTypeId = shirtTypeIdMap.get(row.retreatShirtTypeId);
				if (!mappedTypeId) {
					warnings.push(
						`Inventario de playera "${row.customName ?? row.retreatShirtTypeId}" omitido: la sección de tallas no se copió.`,
					);
					continue;
				}
				await invRepo.save(
					invRepo.create({
						id: uuidv4(),
						retreatId: targetRetreatId,
						retreatShirtTypeId: mappedTypeId,
						requiredQuantity: Number(row.requiredQuantity ?? 0),
						currentQuantity: 0,
						isSufficient: computeIsSufficient(Number(row.requiredQuantity ?? 0), 0),
						notes: row.notes ?? undefined,
						boxLabel: row.boxLabel ?? undefined,
						status: 'pending',
					}),
				);
				result.sections.inventory++;
				continue;
			}

			if (row.inventoryItemId) {
				await invRepo.save(
					invRepo.create({
						id: uuidv4(),
						retreatId: targetRetreatId,
						inventoryItemId: row.inventoryItemId,
						requiredQuantity: Number(row.requiredQuantity ?? 0),
						currentQuantity: 0,
						isSufficient: computeIsSufficient(Number(row.requiredQuantity ?? 0), 0),
						notes: row.notes ?? undefined,
						boxLabel: row.boxLabel ?? undefined,
						ratioOverride: row.ratioOverride ?? null,
						requiredQtyOverride: row.requiredQtyOverride ?? null,
						isExcluded: row.isExcluded ?? false,
						status: 'pending',
					}),
				);
			} else {
				// Fila ad-hoc (sin catálogo ni playera): se copia como ad-hoc.
				await invRepo.save(
					invRepo.create({
						id: uuidv4(),
						retreatId: targetRetreatId,
						requiredQuantity: Number(row.requiredQuantity ?? 0),
						currentQuantity: 0,
						isSufficient: computeIsSufficient(Number(row.requiredQuantity ?? 0), 0),
						notes: row.notes ?? undefined,
						boxLabel: row.boxLabel ?? undefined,
						customName: row.customName ?? undefined,
						customUnit: row.customUnit ?? undefined,
						customCategoryId: row.customCategoryId ?? null,
						customTeamId: row.customTeamId ?? null,
						status: 'pending',
					}),
				);
			}
			result.sections.inventory++;
		}
	}

	// --- 6. Plantillas de mensaje del retiro (reemplazan las copiadas de las
	//        globales al crear; en un retiro sin participantes no hay
	//        scheduled_messages que las referencien) ---
	const templateIdMap = new Map<string, string>();
	if (sections.messageTemplates) {
		const repo = AppDataSource.getRepository(MessageTemplate);
		await repo.delete({ retreatId: targetRetreatId });
		const sourceRows = await repo.find({ where: { retreatId: sourceRetreatId } });
		for (const t of sourceRows) {
			const saved = await repo.save(
				repo.create({
					name: t.name,
					type: t.type,
					scope: 'retreat',
					message: t.message,
					retreatId: targetRetreatId,
					isDefault: t.isDefault,
				}),
			);
			templateIdMap.set(t.id, saved.id);
		}
		result.sections.messageTemplates = sourceRows.length;
	}

	// --- 7. Secuencias de mensajes (config + pasos; SIN mensajes programados) ---
	if (sections.messageSequences) {
		const seqRepo = AppDataSource.getRepository(MessageSequence);
		// sequence_steps y scheduled_messages caen por CASCADE.
		await seqRepo.delete({ retreatId: targetRetreatId });
		const sourceRows = await seqRepo.find({
			where: { retreatId: sourceRetreatId },
			relations: ['steps'],
			order: { createdAt: 'ASC' },
		});
		for (const seq of sourceRows) {
			if (seq.segmentId) {
				warnings.push(
					`Secuencia "${seq.name}": el segmento guardado no se copia (los segmentos son por retiro).`,
				);
			}
			const activeSteps = (seq.steps ?? []).filter((s) => !s.isArchived);
			await messageSequenceService.createSequence({
				name: seq.name,
				description: seq.description ?? null,
				retreatId: targetRetreatId,
				trigger: seq.trigger,
				audience: seq.audience,
				segmentId: null,
				isActive: seq.isActive,
				maxOverdueDays: seq.maxOverdueDays ?? null,
				createdBy: null,
				clonedFrom: seq.id,
				steps: activeSteps.map((s) => ({
					stepOrder: s.stepOrder,
					offsetDays: s.offsetDays,
					sendHour: s.sendHour,
					templateType: s.templateType,
					templateId: s.templateId ? templateIdMap.get(s.templateId) ?? null : null,
					channel: s.channel,
					recipientTarget: s.recipientTarget,
					recipientResponsibility: s.recipientResponsibility ?? null,
					condition: s.condition ?? null,
				})),
			});
			result.sections.messageSequences++;
			result.sections.sequenceSteps += activeSteps.length;
		}
		if (!sections.messageTemplates) {
			warnings.push(
				'Pasos con plantilla específica quedaron por tipo: la sección de plantillas no se copió.',
			);
		}
	}

	// --- 8. Minuto a minuto (delegado; re-ancla fechas y remapea por nombre) ---
	if (sections.schedule) {
		const cloned = await retreatScheduleService.cloneScheduleFromRetreat(
			sourceRetreatId,
			targetRetreatId,
		);
		result.sections.schedule = cloned.created;
		result.sections.santisimoSlots = cloned.santisimoSlots;
		for (const name of cloned.unmatchedResponsabilities) {
			warnings.push(`Responsabilidad sin equivalente en el retiro nuevo: "${name}".`);
		}
	}

	// --- 9. Tareas pre-retiro (delegado; recalcula dueDate por offset) ---
	if (sections.preRetreatTasks) {
		const cloned = await retreatPreRetreatTaskService.cloneFromRetreat(
			sourceRetreatId,
			targetRetreatId,
		);
		result.sections.preRetreatTasks = cloned.created;
	}

	void domainAuditService.log({
		action: DomainAuditAction.RETREAT_CLONE_FROM,
		resourceType: 'retreat',
		resourceId: targetRetreatId,
		retreatId: targetRetreatId,
		actorUserId: actorId ?? null,
		metadata: {
			sourceRetreatId,
			sourceParish: source.parish,
			sections,
			counts: result.sections,
			warnings,
		},
	});

	return result;
};
