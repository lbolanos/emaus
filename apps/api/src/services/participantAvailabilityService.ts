import { AppDataSource } from '../data-source';
import { ParticipantAvailability } from '../entities/participantAvailability.entity';

export interface AvailabilityBlockInput {
	startTime: Date | string;
	endTime: Date | string;
}

export class AvailabilityValidationError extends Error {}

export class ParticipantAvailabilityService {
	// Getter lazy: en tests, AppDataSource.getRepository se redirige al
	// testDataSource sólo después del setup. Una propiedad eager fallaría
	// porque la instancia singleton se construye al importar el módulo.
	private get repo() {
		return AppDataSource.getRepository(ParticipantAvailability);
	}

	async getByParticipant(retreatId: string, participantId: string): Promise<ParticipantAvailability[]> {
		return this.repo.find({
			where: { retreatId, participantId },
			order: { startTime: 'ASC' },
		});
	}

	async getByParticipants(
		retreatId: string,
		participantIds: string[],
	): Promise<Map<string, ParticipantAvailability[]>> {
		const map = new Map<string, ParticipantAvailability[]>();
		if (!participantIds.length) return map;
		const rows = await this.repo
			.createQueryBuilder('pa')
			.where('pa.retreatId = :retreatId', { retreatId })
			.andWhere('pa.participantId IN (:...ids)', { ids: participantIds })
			.orderBy('pa.startTime', 'ASC')
			.getMany();
		for (const row of rows) {
			const list = map.get(row.participantId) ?? [];
			list.push(row);
			map.set(row.participantId, list);
		}
		return map;
	}

	async replaceAll(
		retreatId: string,
		participantId: string,
		blocks: AvailabilityBlockInput[],
	): Promise<ParticipantAvailability[]> {
		const normalized = blocks.map((b) => {
			const start = b.startTime instanceof Date ? b.startTime : new Date(b.startTime);
			const end = b.endTime instanceof Date ? b.endTime : new Date(b.endTime);
			if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
				throw new AvailabilityValidationError('invalid datetime');
			}
			if (end <= start) {
				throw new AvailabilityValidationError('endTime must be greater than startTime');
			}
			return { startTime: start, endTime: end };
		});

		// Detectar bloques solapados entre sí.
		const sorted = [...normalized].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
		for (let i = 1; i < sorted.length; i++) {
			const prev = sorted[i - 1];
			const cur = sorted[i];
			if (cur.startTime.getTime() < prev.endTime.getTime()) {
				throw new AvailabilityValidationError('availability blocks must not overlap');
			}
		}

		await this.repo.delete({ retreatId, participantId });
		if (!normalized.length) return [];

		const entities = normalized.map((b) =>
			this.repo.create({
				retreatId,
				participantId,
				startTime: b.startTime,
				endTime: b.endTime,
			}),
		);
		return this.repo.save(entities);
	}
}

export const participantAvailabilityService = new ParticipantAvailabilityService();
