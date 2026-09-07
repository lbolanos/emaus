import { AppDataSource } from '../data-source';
import { RetreatBed } from '../entities/retreatBed.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { autoAssignBedsForRetreat } from '../services/participantService';
import { authorizationService } from '../middleware/authorization';
import { sortRetreatBedsNaturally } from '../utils/naturalSort';
import { domainAuditService, DomainAuditAction } from '../services/domainAuditService';
import type { Request, Response, NextFunction } from 'express';

export const getRetreatBeds = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		const bedsRaw = await retreatBedRepository.find({
			where: { retreatId: retreatId },
			relations: ['participant'],
		});
		const beds = sortRetreatBedsNaturally(bedsRaw);

		// Enrich participants with their type from retreat_participants
		const participantIds = beds
			.filter((b) => b.participant)
			.map((b) => b.participant!.id);

		if (participantIds.length > 0) {
			const rpRepo = AppDataSource.getRepository(RetreatParticipant);
			const retreatParticipants = await rpRepo.find({
				where: { retreatId },
				select: ['participantId', 'type', 'requestsSingleRoom'],
			});
			const typeMap = new Map(
				retreatParticipants
					.filter((rp) => rp.participantId)
					.map((rp) => [rp.participantId!, rp.type]),
			);
			// `requestsSingleRoom` vive en las dos tablas: el valor por retiro manda
			// sobre el global del Participant, igual que hace el listado de
			// participantes. Sin este overlay el mapa de camas mostraría la
			// preferencia de otro retiro.
			const singleRoomMap = new Map(
				retreatParticipants
					.filter((rp) => rp.participantId && rp.requestsSingleRoom !== undefined)
					.map((rp) => [rp.participantId!, rp.requestsSingleRoom]),
			);

			for (const bed of beds) {
				if (bed.participant) {
					(bed.participant as any).type = typeMap.get(bed.participant.id) || null;
					const perRetreat = singleRoomMap.get(bed.participant.id);
					if (perRetreat !== undefined && perRetreat !== null) {
						bed.participant.requestsSingleRoom = perRetreat;
					}
				}
			}
		}

		res.json(beds);
	} catch (error) {
		next(error);
	}
};

export const assignParticipantToBed = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { bedId } = req.params;
		const { participantId } = req.body; // participantId can be null to unassign
		const userId = (req as any).user?.id;

		// Capturados dentro de la transacción para auditar tras el commit.
		let auditRetreatId: string | null = null;
		let auditPreviousParticipantId: string | null = null;
		// Warning suave (no bloquea) cuando la asignación separa a una pareja en un
		// retiro que hospeda a los matrimonios juntos.
		let coupleWarning: string | undefined;

		// Use TypeORM transaction for atomic operations (auth check inside to prevent TOCTOU)
		await AppDataSource.transaction(async (transactionalEntityManager) => {
			const bedRepo = transactionalEntityManager.getRepository(RetreatBed);
			const participantRepo = transactionalEntityManager.getRepository(Participant);

			// Verify retreat access inside transaction to prevent TOCTOU race
			const bedCheck = await bedRepo.findOne({ where: { id: bedId } });
			if (!bedCheck) {
				throw new Error('Bed not found');
			}
			auditRetreatId = bedCheck.retreatId;
			auditPreviousParticipantId = bedCheck.participantId ?? null;
			const hasAccess = await authorizationService.hasRetreatAccess(userId, bedCheck.retreatId);
			if (!hasAccess) {
				throw new Error('No access to this retreat');
			}

			// If unassigning
			if (participantId === null) {
				await bedRepo.update(bedId, { participantId: null });
				return;
			}

			// Validate inputs
			if (!participantId || typeof participantId !== 'string') {
				throw new Error('Invalid participantId provided');
			}

			// Check if participant exists
			const participant = await participantRepo.findOne({ where: { id: participantId } });
			if (!participant) {
				throw new Error('Participant not found');
			}

			// Check if bed is active
			if (bedCheck.isActive === false) {
				throw new Error('Cannot assign participant to a disabled bed');
			}

			// Check if participant is cancelled (isCancelled lives in retreat_participants)
			const rpRepo = transactionalEntityManager.getRepository(RetreatParticipant);
			const rp = await rpRepo.findOne({ where: { participantId, retreatId: bedCheck.retreatId } });
			if (rp?.isCancelled) {
				throw new Error('Cannot assign cancelled participant to bed');
			}

			// Retiros de parejas: género (bloqueo duro) y pareja separada (warning).
			const retreat = await transactionalEntityManager.getRepository(Retreat).findOne({
				where: { id: bedCheck.retreatId },
				select: ['id', 'retreat_type', 'couplesShareRoom'],
			});
			if (retreat?.retreat_type === 'couples') {
				if (
					retreat.couplesShareRoom === false &&
					(participant.gender === 'M' || participant.gender === 'F')
				) {
					// Dormitorios separados por género: nunca mezclar en una habitación.
					const roomConflict = await bedRepo
						.createQueryBuilder('bed')
						.innerJoinAndSelect('bed.participant', 'p')
						.where('bed.retreatId = :retreatId', { retreatId: bedCheck.retreatId })
						.andWhere('bed.roomNumber = :roomNumber', { roomNumber: bedCheck.roomNumber })
						.andWhere(
							bedCheck.floor == null ? 'bed.floor IS NULL' : 'bed.floor = :floor',
							{ floor: bedCheck.floor },
						)
						.andWhere('bed.id != :bedId', { bedId })
						.andWhere('p.gender IS NOT NULL')
						.andWhere('p.gender != :gender', { gender: participant.gender })
						.getOne();
					if (roomConflict) {
						throw new Error(
							'La habitación ya tiene ocupantes del otro género y este retiro separa los dormitorios por género',
						);
					}
				} else if (retreat.couplesShareRoom !== false && rp?.spouseParticipantId) {
					const spouseBed = await bedRepo.findOne({
						where: {
							retreatId: bedCheck.retreatId,
							participantId: rp.spouseParticipantId,
						},
					});
					if (
						spouseBed &&
						(spouseBed.roomNumber !== bedCheck.roomNumber ||
							(spouseBed.floor ?? null) !== (bedCheck.floor ?? null))
					) {
						coupleWarning =
							'Su pareja está en otra habitación y este retiro hospeda a los matrimonios juntos.';
					}
				}
			}

			// Check if participant already has a bed in the same retreat and unassign if necessary
			const existingBed = await bedRepo.findOne({
				where: { participantId, retreatId: bedCheck.retreatId },
			});
			if (existingBed && existingBed.id !== bedId) {
				await bedRepo.update(existingBed.id, { participantId: null });
			}

			// Check if bed is already assigned to someone else
			if (bedCheck.participantId && bedCheck.participantId !== participantId) {
				throw new Error('Bed is already assigned to another participant');
			}

			// Perform the assignment
			await bedRepo.update(bedId, { participantId });
		});

		// Return the updated bed
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		const updatedBed = await retreatBedRepository.findOne({
			where: { id: bedId },
			relations: ['participant'],
		});

		const isUnassign = participantId === null;
		void domainAuditService.log({
			action: isUnassign ? DomainAuditAction.BED_UNASSIGN : DomainAuditAction.BED_ASSIGN,
			resourceType: 'bed',
			resourceId: bedId,
			retreatId: auditRetreatId,
			metadata: {
				bedId,
				participantId: isUnassign ? auditPreviousParticipantId : participantId,
			},
		});

		res.json(coupleWarning ? { ...updatedBed, warning: coupleWarning } : updatedBed);
	} catch (error: any) {
		// Convert errors to appropriate HTTP responses
		let statusCode = 400;
		let message = error.message || 'Unknown error occurred';

		if (message.includes('No access')) {
			statusCode = 403;
		} else if (message.includes('not found')) {
			statusCode = 404;
		} else if (message.includes('already assigned')) {
			statusCode = 409; // Conflict
		} else if (message.includes('cancelled') || message.includes('otro género')) {
			statusCode = 422; // Unprocessable Entity
		}

		res.status(statusCode).json({ message });
	}
};

export const autoAssignBeds = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const result = await autoAssignBedsForRetreat(retreatId);
		res.json(result);
	} catch (error) {
		next(error);
	}
};

export const toggleBedActive = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { bedId } = req.params;
		const { isActive } = req.body;
		const userId = (req as any).user?.id;

		if (typeof isActive !== 'boolean') {
			res.status(400).json({ message: 'isActive must be a boolean' });
			return;
		}

		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		const bed = await retreatBedRepository.findOne({ where: { id: bedId } });

		if (!bed) {
			res.status(404).json({ message: 'Bed not found' });
			return;
		}

		// Verify retreat access
		const hasAccess = await authorizationService.hasRetreatAccess(userId, bed.retreatId);
		if (!hasAccess) {
			res.status(403).json({ message: 'No access to this retreat' });
			return;
		}

		// If disabling and bed has a participant, unassign them
		const unassignedParticipantId = !isActive && bed.participantId ? bed.participantId : null;
		if (!isActive && bed.participantId) {
			await retreatBedRepository.update(bedId, { isActive, participantId: null });
		} else {
			await retreatBedRepository.update(bedId, { isActive });
		}

		void domainAuditService.log({
			action: DomainAuditAction.BED_TOGGLE_ACTIVE,
			resourceType: 'bed',
			resourceId: bedId,
			retreatId: bed.retreatId,
			oldValues: { isActive: bed.isActive },
			newValues: { isActive },
			metadata: unassignedParticipantId ? { unassignedParticipantId } : undefined,
		});

		const updatedBed = await retreatBedRepository.findOne({
			where: { id: bedId },
			relations: ['participant'],
		});

		res.json(updatedBed);
	} catch (error) {
		next(error);
	}
};

export const clearBedAssignments = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		const result = await retreatBedRepository
			.createQueryBuilder()
			.update(RetreatBed)
			.set({ participantId: null })
			.where('retreatId = :retreatId', { retreatId })
			.execute();
		void domainAuditService.log({
			action: DomainAuditAction.BED_CLEAR_ALL,
			resourceType: 'retreat',
			resourceId: retreatId,
			retreatId,
			metadata: { affected: result.affected ?? null },
		});
		res.json({ message: 'Bed assignments cleared' });
	} catch (error) {
		next(error);
	}
};
