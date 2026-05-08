import { Request, Response } from 'express';
import {
	participantAvailabilityService,
	AvailabilityValidationError,
} from '../services/participantAvailabilityService';
import { authorizationService } from '../middleware/authorization';
import { santisimoService } from '../services/santisimoService';
import { AppDataSource } from '../data-source';
import { SantisimoSlot } from '../entities/santisimoSlot.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { Participant } from '../entities/participant.entity';
import { ParticipantAvailability } from '../entities/participantAvailability.entity';

const checkRetreatAccess = async (req: Request, retreatId: string): Promise<boolean> => {
	const userId = (req.user as any)?.id;
	if (!userId) return false;
	return authorizationService.hasRetreatAccess(userId, retreatId);
};

export const getParticipantAvailability = async (req: Request, res: Response) => {
	const { retreatId, participantId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	const blocks = await participantAvailabilityService.getByParticipant(retreatId, participantId);
	res.json(
		blocks.map((b) => ({
			id: b.id,
			startTime: b.startTime,
			endTime: b.endTime,
		})),
	);
};

export const setParticipantAvailability = async (req: Request, res: Response) => {
	const { retreatId, participantId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	const blocks = (req.body?.blocks ?? []) as Array<{ startTime: string; endTime: string }>;
	try {
		const saved = await participantAvailabilityService.replaceAll(
			retreatId,
			participantId,
			blocks,
		);
		res.json(
			saved.map((b) => ({
				id: b.id,
				startTime: b.startTime,
				endTime: b.endTime,
			})),
		);
	} catch (err) {
		if (err instanceof AvailabilityValidationError) {
			return res.status(400).json({ message: err.message });
		}
		const msg = err instanceof Error ? err.message : 'Unexpected error';
		res.status(500).json({ message: msg });
	}
};

/**
 * Returns servers eligible to be assigned to a santisimo slot.
 *  - Excluye servidores cuyo participantId esté ya en una mesa de este retiro
 *  - Excluye angelitos (partial_server) sin un bloque de availability que cubra el slot,
 *    salvo que se pase ?ignoreAvailability=true (caso "quitar el filtro" en la UI).
 *  - No filtra al resto de servidores (type='server') por horario
 */
export const listEligibleServersForSlot = async (req: Request, res: Response) => {
	const { retreatId, slotId } = req.params;
	const ignoreAvailability = req.query.ignoreAvailability === 'true' || req.query.ignoreAvailability === '1';
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}

	const slot = await AppDataSource.getRepository(SantisimoSlot).findOne({
		where: { id: slotId, retreatId },
	});
	if (!slot) return res.status(404).json({ message: 'Slot not found' });

	// Pull all retreat_participants with type in (server, partial_server)
	const rpRepo = AppDataSource.getRepository(RetreatParticipant);
	const rps = await rpRepo
		.createQueryBuilder('rp')
		.where('rp.retreatId = :retreatId', { retreatId })
		.andWhere('rp.type IN (:...types)', { types: ['server', 'partial_server'] })
		.andWhere('rp.participantId IS NOT NULL')
		.getMany();

	// Exclude those seated in a mesa
	const usable = rps.filter((rp) => !rp.tableId);

	const participantIds = usable.map((rp) => rp.participantId!).filter(Boolean);
	const participants = participantIds.length
		? await AppDataSource.getRepository(Participant)
				.createQueryBuilder('p')
				.where('p.id IN (:...ids)', { ids: participantIds })
				.getMany()
		: [];
	const pMap = new Map(participants.map((p) => [p.id, p]));

	const angelitoIds = usable
		.filter((rp) => rp.type === 'partial_server')
		.map((rp) => rp.participantId!);
	const availabilityMap = await participantAvailabilityService.getByParticipants(
		retreatId,
		angelitoIds,
	);

	const slotStart = new Date(slot.startTime).getTime();
	const slotEnd = new Date(slot.endTime).getTime();

	const result: Array<{
		id: string;
		firstName: string;
		lastName: string;
		nickname?: string;
		cellPhone?: string | null;
		email?: string | null;
		type: 'server' | 'partial_server';
		availability?: Array<{ id: string; startTime: Date; endTime: Date }>;
	}> = [];
	for (const rp of usable) {
		const p = pMap.get(rp.participantId!);
		if (!p) continue;
		if (rp.type === 'partial_server') {
			const blocks = availabilityMap.get(p.id) ?? [];
			// Política legacy-compatible: 0 bloques → disponible siempre.
			// Con ≥1 bloque, exigir que alguno cubra el slot — salvo
			// que el cliente haya pedido ignoreAvailability (toggle "quitar filtro").
			const covers =
				ignoreAvailability ||
				blocks.length === 0 ||
				blocks.some(
					(b: ParticipantAvailability) =>
						new Date(b.startTime).getTime() <= slotStart &&
						new Date(b.endTime).getTime() >= slotEnd,
				);
			if (!covers) continue;
			result.push({
				id: p.id,
				firstName: p.firstName,
				lastName: p.lastName,
				nickname: p.nickname,
				cellPhone: p.cellPhone,
				email: p.email,
				type: 'partial_server',
				availability: blocks.map((b) => ({
					id: b.id,
					startTime: b.startTime,
					endTime: b.endTime,
				})),
			});
		} else {
			// Servidor regular: en slots de mealWindow con filtro ACTIVO,
			// los servidores comunes están comiendo → excluirlos. Solo
			// angelitos disponibles deben aparecer.
			if (slot.mealWindow && !ignoreAvailability) continue;
			result.push({
				id: p.id,
				firstName: p.firstName,
				lastName: p.lastName,
				nickname: p.nickname,
				cellPhone: p.cellPhone,
				email: p.email,
				type: 'server',
			});
		}
	}

	res.json(result);
};

/**
 * Returns a map { slotId: angelitoCount } for ALL mealWindow slots of a retreat,
 * to display per-slot indicators like "3 angelitos disponibles" without opening
 * the assign modal one slot at a time.
 *
 * Same legacy-compatible policy as listEligibleServersForSlot:
 *  - angelitos with 0 blocks count as available for any slot.
 *  - angelitos seated in a mesa are excluded.
 */
export const getMealWindowAngelitoCoverage = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}

	const slots = await AppDataSource.getRepository(SantisimoSlot).find({
		where: { retreatId, mealWindow: true },
	});

	const rps = await AppDataSource.getRepository(RetreatParticipant)
		.createQueryBuilder('rp')
		.where('rp.retreatId = :retreatId', { retreatId })
		.andWhere('rp.type = :t', { t: 'partial_server' })
		.andWhere('rp.participantId IS NOT NULL')
		.getMany();

	const angelitoIds = rps.filter((rp) => !rp.tableId).map((rp) => rp.participantId!);
	const availabilityMap = await participantAvailabilityService.getByParticipants(
		retreatId,
		angelitoIds,
	);

	const coverage: Record<string, number> = {};
	for (const slot of slots) {
		const slotStart = new Date(slot.startTime).getTime();
		const slotEnd = new Date(slot.endTime).getTime();
		let count = 0;
		for (const pid of angelitoIds) {
			const blocks = availabilityMap.get(pid) ?? [];
			const covers =
				blocks.length === 0 ||
				blocks.some(
					(b: ParticipantAvailability) =>
						new Date(b.startTime).getTime() <= slotStart &&
						new Date(b.endTime).getTime() >= slotEnd,
				);
			if (covers) count++;
		}
		coverage[slot.id] = count;
	}
	res.json(coverage);
};

export { participantAvailabilityService, santisimoService };
