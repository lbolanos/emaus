import crypto from 'crypto';
import { AppDataSource } from '../data-source';
import { SantisimoSlot } from '../entities/santisimoSlot.entity';
import { SantisimoSignup } from '../entities/santisimoSignup.entity';
import { Retreat } from '../entities/retreat.entity';
import { domainAuditService } from './domainAuditService';
import { DomainAuditAction } from '@repo/types';

export class SantisimoNotFoundError extends Error {}
export class SantisimoCapacityError extends Error {}
export class SantisimoDisabledError extends Error {}
export class SantisimoPastError extends Error {}

// Diff allowlist del slot. `notes` e `intention` (texto libre/pastoral) quedan
// fuera: solo sus tamaños en metadata, como las notas del minuto a minuto.
const SLOT_AUDIT_FIELDS = ['startTime', 'endTime', 'capacity', 'isDisabled'];
// PII mínima en el signup: teléfono y correo NO entran al log, solo banderas.
const SIGNUP_AUDIT_FIELDS = ['slotId', 'name'];

function slotTextMetadata(slot?: SantisimoSlot | null, prev?: SantisimoSlot | null) {
	if (!slot) return undefined;
	const size = (s: string | null | undefined) => (s ? s.length : 0);
	const meta: Record<string, number> = {};
	const notesNow = size(slot.notes);
	const notesWas = prev ? size(prev.notes) : 0;
	if (prev ? notesNow !== notesWas : notesNow > 0) meta.notesChars = notesNow;
	const intentionNow = size(slot.intention);
	const intentionWas = prev ? size(prev.intention) : 0;
	if (prev ? intentionNow !== intentionWas : intentionNow > 0) meta.intentionChars = intentionNow;
	return Object.keys(meta).length ? meta : undefined;
}

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
		const saved = await this.slotRepo.save(slot);
		void domainAuditService.logCreate('santisimo_slot', saved.id, saved, {
			retreatId,
			fields: SLOT_AUDIT_FIELDS,
			metadata: slotTextMetadata(saved),
		});
		return saved;
	}

	async updateSlot(id: string, data: Partial<SantisimoSlot>): Promise<SantisimoSlot | null> {
		const before = await this.slotRepo.findOne({ where: { id } });
		if (!before) return null;
		const update: Partial<SantisimoSlot> = {};
		if (data.startTime !== undefined) update.startTime = data.startTime;
		if (data.endTime !== undefined) update.endTime = data.endTime;
		if (data.capacity !== undefined) update.capacity = data.capacity;
		if (data.isDisabled !== undefined) update.isDisabled = data.isDisabled;
		if (data.intention !== undefined) update.intention = data.intention;
		if (data.notes !== undefined) update.notes = data.notes;
		await this.slotRepo.update(id, update);
		const after = await this.getSlot(id);
		void domainAuditService.logUpdate('santisimo_slot', id, before, after, {
			retreatId: before.retreatId,
			fields: SLOT_AUDIT_FIELDS,
			metadata: slotTextMetadata(after, before),
		});
		return after;
	}

	async deleteSlot(id: string): Promise<boolean> {
		// Count antes del delete: el FK es CASCADE y las inscripciones se van
		// con el slot — contarlo después siempre daría 0.
		const before = await this.slotRepo.findOne({ where: { id }, relations: ['signups'] });
		const r = await this.slotRepo.delete(id);
		const deleted = (r.affected ?? 0) > 0;
		if (deleted && before) {
			void domainAuditService.logDelete('santisimo_slot', id, before, {
				retreatId: before.retreatId,
				fields: SLOT_AUDIT_FIELDS,
				metadata: {
					cascadeSignups: before.signups?.length ?? 0,
					...slotTextMetadata(before),
				},
			});
		}
		return deleted;
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

		let cleared = 0;
		let cascadeSignups = 0;
		if (params.clearExisting) {
			cleared = await this.slotRepo.count({ where: { retreatId } });
			// Los signups públicos mueren en cascada con sus slots: contarlos
			// ANTES (después ya no existen) — misma regla que deleteSlot.
			cascadeSignups = await this.signupRepo.count({ where: { slot: { retreatId } } });
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

		let created = 0;
		let skippedExisting = 0;
		for (const slot of toInsert) {
			try {
				await this.slotRepo.save(slot);
				created++;
			} catch (err: any) {
				if (err?.code === 'SQLITE_CONSTRAINT' || /UNIQUE/i.test(err?.message || '')) {
					// slot already exists at this start time — skip
					skippedExisting++;
					continue;
				}
				throw err;
			}
		}

		// Generación masiva → UN evento agregado (n inserts individuales = ruido).
		void domainAuditService.log({
			action: DomainAuditAction.SANTISIMO_SLOT_GENERATE,
			resourceType: 'santisimo_slot',
			resourceId: retreatId,
			retreatId,
			metadata: {
				startDateTime: start.toISOString(),
				endDateTime: end.toISOString(),
				slotMinutes,
				capacity,
				clearExisting: !!params.clearExisting,
				cleared,
				cascadeSignups,
				created,
				skippedExisting,
			},
		});

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
		const saved = await this.signupRepo.save(signup);
		void domainAuditService.logCreate('santisimo_signup', saved.id, saved, {
			retreatId,
			fields: SIGNUP_AUDIT_FIELDS,
			action: DomainAuditAction.SANTISIMO_SIGNUP_ADMIN_CREATE,
			metadata: { hasPhone: !!saved.phone, hasEmail: !!saved.email },
		});
		return saved;
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
		// El loop valida por slot y puede lanzar a mitad (slot lleno/pasado):
		// el agregado se emite en finally para que los ya creados no queden
		// sin traza aunque el request overall falle.
		try {
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
		} finally {
			if (created.length) {
				// Ruta pública sin sesión: la IP viene en params, no en auditContext.
				void domainAuditService.log({
					action: DomainAuditAction.SANTISIMO_SIGNUP_PUBLIC_SIGNUP,
					resourceType: 'santisimo_signup',
					resourceId: retreatId,
					retreatId,
					ipAddress: params.ipAddress || null,
					metadata: {
						slotsCount: created.length,
						slotIds: created.map((s) => s.slotId),
						name: params.name.trim(),
						hasPhone: !!params.phone,
						hasEmail: !!params.email,
					},
				});
			}
		}
		return created;
	}

	async deleteSignup(id: string): Promise<boolean> {
		const before = await this.signupRepo.findOne({ where: { id } });
		const r = await this.signupRepo.delete(id);
		const deleted = (r.affected ?? 0) > 0;
		if (deleted && before) {
			// El signup no lleva retreatId: resolverlo vía su slot para que el
			// evento aparezca en el visor del retiro.
			const slot = await this.slotRepo.findOne({ where: { id: before.slotId } });
			void domainAuditService.logDelete('santisimo_signup', id, before, {
				retreatId: slot?.retreatId ?? null,
				fields: SIGNUP_AUDIT_FIELDS,
			});
		}
		return deleted;
	}

	async cancelByToken(token: string): Promise<boolean> {
		const signup = await this.signupRepo.findOne({ where: { cancelToken: token } });
		if (!signup) return false;
		const slot = await this.slotRepo.findOne({ where: { id: signup.slotId } });
		await this.signupRepo.delete(signup.id);
		// El token es un bearer secret: NUNCA entra al log.
		void domainAuditService.logDelete('santisimo_signup', signup.id, signup, {
			retreatId: slot?.retreatId ?? null,
			fields: SIGNUP_AUDIT_FIELDS,
			action: DomainAuditAction.SANTISIMO_SIGNUP_CANCEL,
			metadata: { via: 'cancel_token' },
		});
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
