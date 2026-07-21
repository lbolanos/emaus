import { DataSource, type EntityTarget, type ObjectLiteral } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import { House } from '../entities/house.entity';
import { RetreatBed } from '../entities/retreatBed.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { Role } from '../entities/role.entity';
// Entidades hijas del retiro — usadas por deleteRetreat para el borrado en cascada explícito.
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { Participant } from '../entities/participant.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { ServiceTeam } from '../entities/serviceTeam.entity';
import { ServiceTeamMember } from '../entities/serviceTeamMember.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { MessageSequence } from '../entities/messageSequence.entity';
import { SequenceStep } from '../entities/sequenceStep.entity';
import { ScheduledMessage } from '../entities/scheduledMessage.entity';
import { RetreatInventory } from '../entities/retreatInventory.entity';
import { RetreatInventoryHistory } from '../entities/retreatInventoryHistory.entity';
import { RetreatShirtType } from '../entities/retreatShirtType.entity';
import { ParticipantShirtSize } from '../entities/participantShirtSize.entity';
import { RetreatPreparation } from '../entities/retreatPreparation.entity';
import { RetreatPreparationDocument } from '../entities/retreatPreparationDocument.entity';
import { RetreatScheduleItem } from '../entities/retreatScheduleItem.entity';
import { RetreatScheduleItemResponsable } from '../entities/retreatScheduleItemResponsable.entity';
import { RetreatPreRetreatTask } from '../entities/retreatPreRetreatTask.entity';
import { SantisimoSlot } from '../entities/santisimoSlot.entity';
import { SantisimoSignup } from '../entities/santisimoSignup.entity';
import { Responsability } from '../entities/responsability.entity';
import { Tag } from '../entities/tag.entity';
import { ParticipantTag } from '../entities/participantTag.entity';
import { SavedSegment } from '../entities/savedSegment.entity';
import { RetreatMemoryPhoto } from '../entities/retreatMemoryPhoto.entity';
import { RetreatMemorySong } from '../entities/retreatMemorySong.entity';
import { ChatConversation } from '../entities/chatConversation.entity';
import { CrmTask } from '../entities/crmTask.entity';
import { Payment } from '../entities/payment.entity';
import { ParticipantDebt } from '../entities/participantDebt.entity';
import { ParticipantCommunication } from '../entities/participantCommunication.entity';
import { ParticipantFollowUp } from '../entities/participantFollowUp.entity';
import { ParticipantAvailability } from '../entities/participantAvailability.entity';
import { performanceOptimizationService } from './performanceOptimizationService';
import { getRepository, getRepositories } from '../utils/repositoryHelpers';
import { GlobalMessageTemplateService } from './globalMessageTemplateService';
import { messageSequenceService } from './messageSequenceService';
import { retreatPreparationService, addDaysYmd } from './retreatPreparationService';
import { createDefaultResponsibilitiesForRetreat } from './responsabilityService';
import { createDefaultTablesForRetreat } from './tableMesaService';
import { seedDefaultShirtTypes } from './shirtTypeService';
import { createDefaultInventoryForRetreat } from './inventoryService';
import { createDefaultServiceTeamsForRetreat } from './serviceTeamService';
import { createDefaultInventoryData } from '../data/inventorySeeder';
import { createDefaultScheduleTemplate } from '../data/scheduleTemplateSeeder';
import { createDefaultPreRetreatTaskTemplate } from '../data/preRetreatTaskSeeder';
import { authorizationService } from '../middleware/authorization';
import { domainAuditService } from './domainAuditService';
import { ROLES } from '@repo/types';
import type { CreateRetreat, UpdateRetreat } from '@repo/types';
import { v4 as uuidv4 } from 'uuid';

// Campos de negocio del retiro que vale la pena auditar (allowlist para el diff).
const RETREAT_AUDIT_FIELDS = [
	'parish',
	'slug',
	'startDate',
	'endDate',
	'isPublic',
	'max_walkers',
	'max_servers',
	'cost',
	'serverFeeAmount',
	'mealCost',
	'paymentInfo',
	'houseId',
	'timezone',
	'memoryPhotoUrl',
	'musicPlaylistUrl',
];

export const getRetreats = async (dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	return retreatRepository.find({ relations: ['house'], order: { startDate: 'DESC' } });
};

export const getRetreatsForUser = async (userId: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);

	// Check if user is superadmin - if so, return all retreats
	const isSuperadmin = await authorizationService.hasRole(userId, ROLES.superadmin);
	if (isSuperadmin) {
		return repos.retreat.find({ relations: ['house'], order: { startDate: 'DESC' } });
	}

	// Get retreats the user has access to via user_retreats table
	const userRetreats = await repos.userRetreat.find({
		where: { userId, status: 'active' },
		relations: ['retreat'],
	});

	const retreatIdsFromUserRetreats = userRetreats.map((ur) => ur.retreatId);

	// Get retreats the user created
	const createdRetreats = await repos.retreat.find({
		where: { createdBy: userId },
		relations: ['house'],
	});

	const retreatIdsFromCreated = createdRetreats.map((r) => r.id);

	// Combine both sets of retreat IDs and remove duplicates
	const allRetreatIds = [...new Set([...retreatIdsFromUserRetreats, ...retreatIdsFromCreated])];

	if (allRetreatIds.length === 0) {
		return [];
	}

	// Use TypeORM's In operator to get all accessible retreats
	const queryBuilder = repos.retreat.createQueryBuilder('retreat');
	queryBuilder.where('retreat.id IN (:...retreatIds)', { retreatIds: allRetreatIds });
	queryBuilder.leftJoinAndSelect('retreat.house', 'house');
	queryBuilder.orderBy('retreat.startDate', 'DESC');
	const retreats = await queryBuilder.getMany();

	return retreats;
};

import { In, MoreThan, Not } from 'typeorm';

export const findPublicRetreats = async (dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	return retreatRepository.find({
		where: {
			isPublic: true,
			startDate: MoreThan(new Date()),
		},
		relations: ['house'],
		order: { startDate: 'ASC' },
	});
};

export const findActiveRetreats = async (dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	const today = new Date();
	const bufferStart = new Date(today);
	bufferStart.setDate(bufferStart.getDate() + 1);
	const bufferEnd = new Date(today);
	bufferEnd.setDate(bufferEnd.getDate() - 1);
	const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

	return retreatRepository
		.createQueryBuilder('retreat')
		.select([
			'retreat.id',
			'retreat.parish',
			'retreat.startDate',
			'retreat.endDate',
		])
		.where('retreat.startDate <= :bufferStart', { bufferStart: toIsoDate(bufferStart) })
		.andWhere('retreat.endDate >= :bufferEnd', { bufferEnd: toIsoDate(bufferEnd) })
		.orderBy('retreat.startDate', 'ASC')
		.getMany();
};

export const findById = async (id: string, dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	return retreatRepository.findOne({
		where: { id },
		relations: ['house', 'memoryPhotos', 'memorySongs'],
	});
};

export const findBySlug = async (slug: string, dataSource?: DataSource) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	return retreatRepository.findOne({ where: { slug }, relations: ['house'] });
};

export const isSlugAvailable = async (
	slug: string,
	excludeRetreatId?: string,
	dataSource?: DataSource,
) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	const where: any = { slug };
	if (excludeRetreatId) {
		where.id = Not(excludeRetreatId);
	}
	const existing = await retreatRepository.findOne({ where });
	return !existing;
};

export const refreshRetreatBedsFromHouse = async (
	retreatId: string,
	houseId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	// 1. Delete all existing retreat beds
	await repos.retreatBed.delete({ retreat: { id: retreatId } });

	// 2. Fetch house with beds relation
	const house = await repos.house.findOne({
		where: { id: houseId },
		relations: ['beds'],
	});

	// 3. Create new RetreatBed records from house beds
	if (house && house.beds) {
		const retreat = await repos.retreat.findOne({ where: { id: retreatId } });
		if (retreat) {
			const newRetreatBeds = house.beds.map((bed) => {
				return repos.retreatBed.create({
					id: uuidv4(),
					roomNumber: bed.roomNumber,
					bedNumber: bed.bedNumber,
					floor: bed.floor,
					type: bed.type,
					defaultUsage: bed.defaultUsage,
					floorLabel: bed.floorLabel,
					retreat,
				});
			});
			await repos.retreatBed.save(newRetreatBeds);
		}
	}
};

export const update = async (
	id: string,
	retreatData: UpdateRetreat,
	refreshBeds?: boolean,
	dataSource?: DataSource,
) => {
	const retreatRepository = getRepository(Retreat, dataSource);
	const retreat = await retreatRepository.findOne({ where: { id } });
	if (!retreat) {
		return null;
	}

	// Validate slug uniqueness
	if (retreatData.slug && retreatData.slug !== retreat.slug) {
		const available = await isSlugAvailable(retreatData.slug, id, dataSource);
		if (!available) {
			throw Object.assign(new Error('Este slug ya está en uso por otro retiro.'), { statusCode: 409 });
		}
	}

	// Capture old startDate BEFORE we mutate `retreat` so we can shift the
	// schedule items by the delta below. SQLite returns dates as strings;
	// Postgres returns Date objects — normalise to a timestamp for the diff.
	const toMs = (v: Date | string | null | undefined): number | null => {
		if (!v) return null;
		const d = v instanceof Date ? v : new Date(v);
		const t = d.getTime();
		return Number.isFinite(t) ? t : null;
	};
	const oldStartMs = toMs(retreat.startDate);
	const newStartRaw = (retreatData as { startDate?: Date | string | null }).startDate;
	const newStartMs = newStartRaw !== undefined ? toMs(newStartRaw) : null;

	const oldSnapshot = { ...retreat };
	Object.assign(retreat, retreatData);
	await retreatRepository.save(retreat);
	void domainAuditService.logUpdate('retreat', id, oldSnapshot, retreat, {
		retreatId: id,
		fields: RETREAT_AUDIT_FIELDS,
	});

	if (refreshBeds && retreat.houseId) {
		await refreshRetreatBedsFromHouse(id, retreat.houseId, dataSource);
		// Re-assign participants to the new beds
		const { autoAssignBedsForRetreat } = await import('./participantService');
		await autoAssignBedsForRetreat(id);
	}

	// Cascade startDate change to schedule items: keep the same time-of-day
	// for each item (e.g. 9:00 AM stays 9:00 AM) but shift the calendar day
	// by the delta. Without this, changing the retreat from Apr-17 to Apr-28
	// leaves all items frozen at Apr-17, which is what users hit during
	// the San Judas E2E sim (Bug J).
	if (
		oldStartMs !== null &&
		newStartMs !== null &&
		oldStartMs !== newStartMs &&
		newStartRaw !== undefined
	) {
		const minutesDelta = Math.round((newStartMs - oldStartMs) / 60000);
		if (minutesDelta !== 0) {
			try {
				const { retreatScheduleService } = await import('./retreatScheduleService');
				await retreatScheduleService.shiftAllItems(id, minutesDelta);
			} catch (err) {
				// Don't fail the retreat update if schedule shift fails — log and continue.
				console.warn(`[retreatService.update] schedule shift failed for ${id}:`, err);
			}
		}
	}

	return retreat;
};

export const createRetreat = async (
	retreatData: CreateRetreat & { createdBy?: string },
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	// 0. Ensure default inventory + schedule/pre-retreat template data exist
	await createDefaultInventoryData();
	await createDefaultScheduleTemplate();
	await createDefaultPreRetreatTaskTemplate();

	// Validate slug uniqueness
	if (retreatData.slug) {
		const available = await isSlugAvailable(retreatData.slug, undefined, dataSource);
		if (!available) {
			throw Object.assign(new Error('Este slug ya está en uso por otro retiro.'), { statusCode: 409 });
		}
	}

	// 1. Create and save the retreat
	const newRetreat = repos.retreat.create({
		...retreatData,
		id: uuidv4(),
	});
	await repos.retreat.save(newRetreat);

	// 2. Assign retreat creator role to the user
	if (retreatData.createdBy) {
		console.log('Creating UserRetreat assignment for retreat creator:', {
			userId: retreatData.createdBy,
			retreatId: newRetreat.id,
		});

		// Get the admin role for retreat-specific assignment
		const adminRole = await repos.role.findOne({ where: { name: 'admin' } });
		if (adminRole) {
			console.log('Found admin role:', adminRole);
			const creatorRetreatAssignment = repos.userRetreat.create({
				userId: retreatData.createdBy,
				retreatId: newRetreat.id,
				roleId: adminRole.id,
				status: 'active',
				invitedBy: retreatData.createdBy, // Self-invited
				invitedAt: new Date(),
			});
			console.log('Created UserRetreat assignment:', creatorRetreatAssignment);
			await repos.userRetreat.save(creatorRetreatAssignment);
			console.log('UserRetreat assignment saved successfully');
		} else {
			console.log('Admin role not found!');
		}
	} else {
		console.log('No createdBy field in retreatData:', retreatData);
	}

	// 3. Create default responsibilities
	await createDefaultResponsibilitiesForRetreat(newRetreat, dataSource);

	// 4. Create default tables
	await createDefaultTablesForRetreat(newRetreat, dataSource);

	// 4.5. Create default service teams
	await createDefaultServiceTeamsForRetreat(newRetreat, dataSource);

	// 5. Copy global message templates to this retreat
	const globalMessageTemplateService = new GlobalMessageTemplateService(dataSource);
	await globalMessageTemplateService.copyAllActiveTemplatesToRetreat(newRetreat);

	// 5.5. Seed registration sequences (bienvenida/privacidad/palanquero). Estas
	// REEMPLAZAN los envíos automáticos que antes hacía el alta; respetan los
	// flags notifyParticipant/notifyInviter.
	try {
		await messageSequenceService.createDefaultMessageSequencesForRetreat(newRetreat as any);
	} catch (seqErr) {
		console.error('Error seeding default message sequences for retreat:', seqErr);
	}

	// 6. Create default inventory
	await createDefaultInventoryForRetreat(newRetreat, dataSource);

	// 6.5. Seed default Mexican-style shirt types
	await seedDefaultShirtTypes(newRetreat.id);

	// 6.6. Calendario de preparaciones por defecto: 7 sesiones semanales que
	// terminan una semana antes del retiro, a las 20:00 (todo editable después).
	try {
		const rawStart: unknown = newRetreat.startDate;
		const startYmd =
			typeof rawStart === 'string'
				? (rawStart).slice(0, 10)
				: rawStart instanceof Date
					? rawStart.toISOString().slice(0, 10)
					: null;
		if (startYmd) {
			await retreatPreparationService.generate(newRetreat.id, {
				weeks: 7,
				firstDate: addDaysYmd(startYmd, -7 * 7),
				time: '20:00',
				includeDefaultDocs: true,
			});
		}
	} catch (prepErr) {
		console.error('Error seeding default preparations calendar for retreat:', prepErr);
	}

	// 7. Create retreat beds from house beds
	if (retreatData.houseId) {
		const house = await repos.house.findOne({
			where: { id: retreatData.houseId },
			relations: ['beds'],
		});

		if (house && house.beds) {
			const newRetreatBeds = house.beds.map((bed) => {
				return repos.retreatBed.create({
					id: uuidv4(),
					roomNumber: bed.roomNumber,
					bedNumber: bed.bedNumber,
					floor: bed.floor,
					type: bed.type,
					defaultUsage: bed.defaultUsage,
					floorLabel: bed.floorLabel,
					retreat: newRetreat,
				});
			});
			await repos.retreatBed.save(newRetreatBeds);
		}
	}

	// Fetch the retreat with house relation before returning
	const result = await repos.retreat.findOne({
		where: { id: newRetreat.id },
		relations: ['house'],
	});

	void domainAuditService.logCreate('retreat', newRetreat.id, newRetreat, {
		retreatId: newRetreat.id,
		fields: RETREAT_AUDIT_FIELDS,
	});

	return result;
};

/**
 * Elimina un retiro y TODAS sus entidades dependientes de forma segura.
 *
 * Autorización (la ruta ya exigió el permiso `retreat:delete`):
 *   - superadmin  → puede borrar cualquier retiro, con o sin participantes.
 *   - admin       → solo retiros que él creó (`createdBy`) y SIN participantes activos.
 *
 * Borrado: NO confiamos en `ON DELETE CASCADE` (en SQLite depende del DDL real y de
 * `PRAGMA foreign_keys`, que la config no garantiza). Borramos explícitamente cada tabla
 * hija en orden nietas → hijas → retiro, dentro de una transacción. Las tablas históricas
 * (auditoría/telemetría/testimonios) conservan su registro con `retreatId = NULL`.
 */
export const deleteRetreat = async (
	retreatId: string,
	actor: { id: string },
	dataSource?: DataSource,
) => {
	const ds = dataSource || AppDataSource;
	const retreatRepository = ds.getRepository(Retreat);
	const retreat = await retreatRepository.findOne({ where: { id: retreatId } });
	if (!retreat) {
		throw Object.assign(new Error('Retreat not found'), { statusCode: 404 });
	}

	// --- Autorización fina ---
	const isSuperadmin = await authorizationService.hasRole(actor.id, ROLES.superadmin);
	if (!isSuperadmin) {
		// Admin: solo puede borrar retiros que él mismo creó.
		if (retreat.createdBy !== actor.id) {
			throw Object.assign(new Error('Solo puedes eliminar retiros que tú creaste.'), {
				statusCode: 403,
			});
		}
		// Admin: y solo si el retiro no tiene participantes activos.
		// `isCancelled = false` en retreat_participants es el ground truth del soft-delete
		// de participantes (ver participantService.deleteParticipant).
		const activeParticipants = await ds.getRepository(RetreatParticipant).count({
			where: { retreatId, isCancelled: false },
		});
		if (activeParticipants > 0) {
			throw Object.assign(
				new Error(
					`No se puede eliminar: el retiro tiene ${activeParticipants} participante(s) inscrito(s). Solo un superadministrador puede eliminar retiros con participantes.`,
				),
				{ statusCode: 409 },
			);
		}
	}

	const snapshot = { ...retreat };

	await ds.transaction(async (manager) => {
		// Borra una tabla hija por su columna `retreatId`.
		const delByRetreat = (entity: EntityTarget<ObjectLiteral>) =>
			manager.getRepository(entity).delete({ retreatId } as any);

		// IDs de una tabla padre (para borrar sus nietas, que no tienen `retreatId`).
		const idsByRetreat = async (entity: EntityTarget<ObjectLiteral>): Promise<string[]> => {
			const rows = await manager.getRepository(entity).find({ where: { retreatId } as any });
			return rows.map((r: any) => r.id as string);
		};

		// Borra una tabla nieta por su columna FK al padre.
		const delByParent = async (
			entity: EntityTarget<ObjectLiteral>,
			fkColumn: string,
			parentIds: string[],
		) => {
			if (parentIds.length === 0) return;
			await manager.getRepository(entity).delete({ [fkColumn]: In(parentIds) } as any);
		};

		// 1) IDs de tablas padre cuyas nietas no tienen `retreatId` directo.
		const sequenceIds = await idsByRetreat(MessageSequence);
		const preparationIds = await idsByRetreat(RetreatPreparation);
		const scheduleItemIds = await idsByRetreat(RetreatScheduleItem);
		const serviceTeamIds = await idsByRetreat(ServiceTeam);
		const santisimoSlotIds = await idsByRetreat(SantisimoSlot);
		const participantIds = await idsByRetreat(Participant);

		// 2) Nietas (sin `retreatId`) — antes que sus padres.
		await delByParent(SequenceStep, 'sequenceId', sequenceIds);
		await delByParent(RetreatPreparationDocument, 'preparationId', preparationIds);
		await delByParent(RetreatScheduleItemResponsable, 'scheduleItemId', scheduleItemIds);
		await delByParent(ServiceTeamMember, 'serviceTeamId', serviceTeamIds);
		await delByParent(SantisimoSignup, 'slotId', santisimoSlotIds);
		await delByParent(ParticipantShirtSize, 'participantId', participantIds);
		await delByParent(ParticipantTag, 'participantId', participantIds);

		// 3) Hijas con columna `retreatId` directa. `retreat_participants` y `participants`
		//    van al final (otras hijas —p. ej. payments— referencian participantId).
		const childrenWithRetreatId: EntityTarget<ObjectLiteral>[] = [
			ScheduledMessage,
			MessageSequence,
			MessageTemplate,
			RetreatScheduleItem,
			RetreatPreparation,
			ServiceTeam,
			SantisimoSlot,
			RetreatShirtType,
			RetreatInventoryHistory,
			RetreatInventory,
			RetreatBed,
			TableMesa,
			Responsability,
			Tag,
			SavedSegment,
			RetreatMemoryPhoto,
			RetreatMemorySong,
			ChatConversation,
			CrmTask,
			RetreatPreRetreatTask,
			Payment,
			ParticipantDebt,
			ParticipantCommunication,
			ParticipantFollowUp,
			ParticipantAvailability,
			RetreatParticipant,
			Participant,
			UserRetreat,
		];
		for (const entity of childrenWithRetreatId) {
			await delByRetreat(entity);
		}

		// 4) Tablas históricas: preservar el registro, soltar el vínculo (retreatId → NULL).
		for (const table of [
			'audit_logs',
			'domain_audit_log',
			'telemetry_events',
			'telemetry_metrics',
			'testimonials',
		]) {
			try {
				await manager.query(`UPDATE ${table} SET retreatId = NULL WHERE retreatId = ?`, [
					retreatId,
				]);
			} catch (err) {
				console.warn(`[deleteRetreat] no se pudo desvincular ${table}:`, err);
			}
		}

		// 5) Tablas legacy no mapeadas como entidad TypeORM (config.ts las excluye).
		for (const table of ['permission_overrides', 'role_requests']) {
			try {
				await manager.query(`DELETE FROM ${table} WHERE retreatId = ?`, [retreatId]);
			} catch (err) {
				console.warn(`[deleteRetreat] no se pudo limpiar ${table}:`, err);
			}
		}

		// 6) Finalmente, el retiro.
		await manager.getRepository(Retreat).delete({ id: retreatId });
	});

	// Invalidar cachés relacionadas al retiro (best-effort).
	try {
		performanceOptimizationService.invalidateRetreatPermissionCache(retreatId);
		performanceOptimizationService.invalidateRetreatCache(retreatId);
	} catch {
		/* noop */
	}

	void domainAuditService.logDelete('retreat', retreatId, snapshot, {
		retreatId,
		fields: RETREAT_AUDIT_FIELDS,
		metadata: { deletedBy: actor.id, superadmin: isSuperadmin },
	});

	return retreat;
};

/**
 * Conteos del impacto de borrar un retiro — para advertir en el diálogo de confirmación
 * cuánto se perdería (sobre todo cuando un superadmin borra un retiro poblado).
 */
export const getRetreatDeletionImpact = async (retreatId: string, dataSource?: DataSource) => {
	const ds = dataSource || AppDataSource;
	const [activeParticipants, totalRegistrations, payments, tables, scheduledMessages] =
		await Promise.all([
			ds.getRepository(RetreatParticipant).count({ where: { retreatId, isCancelled: false } }),
			ds.getRepository(RetreatParticipant).count({ where: { retreatId } }),
			ds.getRepository(Payment).count({ where: { retreatId } }),
			ds.getRepository(TableMesa).count({ where: { retreatId } }),
			ds.getRepository(ScheduledMessage).count({ where: { retreatId } }),
		]);
	return { activeParticipants, totalRegistrations, payments, tables, scheduledMessages };
};
