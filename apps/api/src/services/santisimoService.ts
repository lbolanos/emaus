import crypto from 'crypto';
import { AppDataSource } from '../data-source';
import { SantisimoSlot } from '../entities/santisimoSlot.entity';
import { SantisimoSignup } from '../entities/santisimoSignup.entity';
import { Retreat } from '../entities/retreat.entity';

export class SantisimoNotFoundError extends Error {}
export class SantisimoCapacityError extends Error {}
export class SantisimoDisabledError extends Error {}
export class SantisimoPastError extends Error {}

export class SantisimoService {
	private slotRepo = AppDataSource.getRepository(SantisimoSlot);
	private signupRepo = AppDataSource.getRepository(SantisimoSignup);
	private retreatRepo = AppDataSource.getRepository(Retreat);

	async listSlotsForRetreat(retreatId: string): Promise<
		Array<SantisimoSlot & { signedUpCount: number; signups: SantisimoSignup[] }>
	> {
		const slots = await this.slotRepo.find({
			where: { retreatId },
			relations: ['signups'],
			order: { startTime: 'ASC' },
		});
		return slots.map((s) => ({
			...s,
			signups: s.signups ?? [],
			signedUpCount: s.signups?.length ?? 0,
		}));
	}

	async getSlot(id: string): Promise<SantisimoSlot | null> {
		return this.slotRepo.findOne({ where: { id }, relations: ['signups'] });
	}

	async createSlot(retreatId: string, data: Partial<SantisimoSlot>): Promise<SantisimoSlot> {
		const slot = this.slotRepo.create({
			retreatId,
			startTime: data.startTime!,
			endTime: data.endTime!,
			capacity: data.capacity ?? 1,
			isDisabled: data.isDisabled ?? false,
			intention: data.intention ?? null,
			notes: data.notes ?? null,
		});
		return this.slotRepo.save(slot);
	}

	async updateSlot(id: string, data: Partial<SantisimoSlot>): Promise<SantisimoSlot | null> {
		const update: Partial<SantisimoSlot> = {};
		if (data.startTime !== undefined) update.startTime = data.startTime;
		if (data.endTime !== undefined) update.endTime = data.endTime;
		if (data.capacity !== undefined) update.capacity = data.capacity;
		if (data.isDisabled !== undefined) update.isDisabled = data.isDisabled;
		if (data.intention !== undefined) update.intention = data.intention;
		if (data.notes !== undefined) update.notes = data.notes;
		await this.slotRepo.update(id, update);
		return this.getSlot(id);
	}

	async deleteSlot(id: string): Promise<boolean> {
		const r = await this.slotRepo.delete(id);
		return (r.affected ?? 0) > 0;
	}

	async generateSlots(
		retreatId: string,
		params: {
			startDateTime: Date;
			endDateTime: Date;
			slotMinutes?: number;
			capacity?: number;
			clearExisting?: boolean;
		},
	): Promise<SantisimoSlot[]> {
		const slotMinutes = params.slotMinutes ?? 60;
		const capacity = params.capacity ?? 1;
		const start = new Date(params.startDateTime);
		const end = new Date(params.endDateTime);

		if (end <= start) {
			throw new Error('endDateTime must be after startDateTime');
		}

		if (params.clearExisting) {
			await this.slotRepo.delete({ retreatId });
		}

		const toInsert: SantisimoSlot[] = [];
		for (
			let cursor = new Date(start);
			cursor < end;
			cursor = new Date(cursor.getTime() + slotMinutes * 60_000)
		) {
			const next = new Date(cursor.getTime() + slotMinutes * 60_000);
			const slotEnd = next > end ? end : next;
			toInsert.push(
				this.slotRepo.create({
					retreatId,
					startTime: new Date(cursor),
					endTime: slotEnd,
					capacity,
					isDisabled: false,
				}),
			);
		}

		for (const slot of toInsert) {
			try {
				await this.slotRepo.save(slot);
			} catch (err: any) {
				if (err?.code === 'SQLITE_CONSTRAINT' || /UNIQUE/i.test(err?.message || '')) {
					// slot already exists at this start time — skip
					continue;
				}
				throw err;
			}
		}

		return this.listSlotsForRetreat(retreatId);
	}

	async listSignupsForSlot(slotId: string): Promise<SantisimoSignup[]> {
		return this.signupRepo.find({
			where: { slotId },
			order: { createdAt: 'ASC' },
		});
	}

	async getRetreatBySlug(slug: string): Promise<Retreat | null> {
		return this.retreatRepo.findOne({ where: { slug } });
	}

	async getRetreatById(id: string): Promise<Retreat | null> {
		return this.retreatRepo.findOne({ where: { id } });
	}

	/**
	 * Admin-initiated signup. Loose validation (phone optional, allows "angelitos").
	 */
	async adminCreateSignup(
		retreatId: string,
		data: {
			slotId: string;
			name: string;
			phone?: string | null;
			email?: string | null;
			userId?: string | null;
		},
	): Promise<SantisimoSignup> {
		const slot = await this.slotRepo.findOne({
			where: { id: data.slotId, retreatId },
			relations: ['signups'],
		});
		if (!slot) throw new SantisimoNotFoundError('Slot not found');
		if (slot.isDisabled) throw new SantisimoDisabledError('Slot is disabled');
		const current = slot.signups?.length ?? 0;
		if (current >= slot.capacity) throw new SantisimoCapacityError('Slot full');

		const signup = this.signupRepo.create({
			slotId: slot.id,
			name: data.name.trim(),
			phone: data.phone?.trim() || null,
			email: data.email?.trim() || null,
			userId: data.userId || null,
			cancelToken: null,
		});
		return this.signupRepo.save(signup);
	}

	/**
	 * Public signup. Returns the created signups with their cancel tokens.
	 */
	async publicSignup(
		retreatId: string,
		params: {
			slotIds: string[];
			name: string;
			phone?: string;
			email?: string;
			ipAddress?: string;
		},
	): Promise<SantisimoSignup[]> {
		const all = await this.slotRepo
			.createQueryBuilder('s')
			.leftJoinAndSelect('s.signups', 'sig')
			.where('s.id IN (:...ids)', { ids: params.slotIds })
			.andWhere('s.retreatId = :retreatId', { retreatId })
			.getMany();

		if (all.length !== params.slotIds.length) {
			throw new SantisimoNotFoundError('One or more slots not found');
		}

		const now = new Date();
		const created: SantisimoSignup[] = [];
		for (const slot of all) {
			if (slot.isDisabled) throw new SantisimoDisabledError(`Slot ${slot.id} disabled`);
			if (new Date(slot.endTime) < now)
				throw new SantisimoPastError(`Slot ${slot.id} already passed`);
			const current = slot.signups?.length ?? 0;
			if (current >= slot.capacity)
				throw new SantisimoCapacityError(`Slot ${slot.id} full`);

			const signup = this.signupRepo.create({
				slotId: slot.id,
				name: params.name.trim(),
				phone: params.phone?.trim() || null,
				email: params.email?.trim() || null,
				userId: null,
				cancelToken: crypto.randomBytes(24).toString('hex'),
				ipAddress: params.ipAddress || null,
			});
			const saved = await this.signupRepo.save(signup);
			created.push(saved);
		}
		return created;
	}

	async deleteSignup(id: string): Promise<boolean> {
		const r = await this.signupRepo.delete(id);
		return (r.affected ?? 0) > 0;
	}

	async cancelByToken(token: string): Promise<boolean> {
		const signup = await this.signupRepo.findOne({ where: { cancelToken: token } });
		if (!signup) return false;
		await this.signupRepo.delete(signup.id);
		return true;
	}

	/**
	 * Public view: returns the schedule for a retreat identified by slug,
	 * but only if the retreat is public and santisimo is enabled.
	 */
	async getPublicSchedule(slug: string): Promise<{
		retreat: Retreat;
		slots: Array<{
			id: string;
			startTime: Date;
			endTime: Date;
			capacity: number;
			isDisabled: boolean;
			intention?: string | null;
			signedUpCount: number;
			signups: Array<{ firstName: string }>;
		}>;
	} | null> {
		const retreat = await this.retreatRepo.findOne({ where: { slug } });
		if (!retreat) return null;
		if (!retreat.isPublic || !retreat.santisimoEnabled) return null;

		const slots = await this.slotRepo.find({
			where: { retreatId: retreat.id },
			relations: ['signups'],
			order: { startTime: 'ASC' },
		});

		return {
			retreat,
			slots: slots.map((s) => ({
				id: s.id,
				startTime: s.startTime,
				endTime: s.endTime,
				capacity: s.capacity,
				isDisabled: s.isDisabled,
				intention: s.intention ?? null,
				signedUpCount: s.signups?.length ?? 0,
				signups: (s.signups ?? []).map((sig) => ({
					firstName: (sig.name || '').split(' ')[0] || '',
				})),
			})),
		};
	}
}

export const santisimoService = new SantisimoService();
