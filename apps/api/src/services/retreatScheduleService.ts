import { AppDataSource } from '../data-source';
import { RetreatScheduleItem, ScheduleItemStatus } from '../entities/retreatScheduleItem.entity';
import { RetreatScheduleItemResponsable } from '../entities/retreatScheduleItemResponsable.entity';
import { ScheduleTemplate } from '../entities/scheduleTemplate.entity';
import { responsabilityAttachmentService } from './responsabilityAttachmentService';
import { ResponsabilityAttachment } from '../entities/responsabilityAttachment.entity';
import { SantisimoSlot } from '../entities/santisimoSlot.entity';
import { SantisimoSignup } from '../entities/santisimoSignup.entity';
import { Participant } from '../entities/participant.entity';
import { Responsability } from '../entities/responsability.entity';
import { Retreat } from '../entities/retreat.entity';
import archiver from 'archiver';
import type { Readable, Writable } from 'stream';
import { s3Service } from './s3Service';
import { ensureCharlaResponsibilitiesFromTemplateSet } from './responsabilityService';
import {
	emitScheduleItemCompleted,
	emitScheduleItemStarted,
	emitScheduleUpdated,
	emitScheduleDelay,
} from '../realtime';
import { MoreThanOrEqual, In } from 'typeorm';

export class ScheduleNotFoundError extends Error {}

type ResponsablePayload = { participantId: string; role?: string | null };

export class RetreatScheduleService {
	private itemRepo = AppDataSource.getRepository(RetreatScheduleItem);
	private respRepo = AppDataSource.getRepository(RetreatScheduleItemResponsable);
	private templateRepo = AppDataSource.getRepository(ScheduleTemplate);
	private slotRepo = AppDataSource.getRepository(SantisimoSlot);
	private signupRepo = AppDataSource.getRepository(SantisimoSignup);
	private participantRepo = AppDataSource.getRepository(Participant);
	private responsabilityRepo = AppDataSource.getRepository(Responsability);

	/**
	 * Construye un Map<nombre normalizado, responsabilityId> con las
	 * Responsabilidades de un retiro, para hacer match exacto por nombre.
	 */
	private async buildResponsabilityNameIndex(retreatId: string): Promise<Map<string, string>> {
		const resps = await this.responsabilityRepo.find({ where: { retreatId } });
		const map = new Map<string, string>();
		for (const r of resps) {
			map.set(r.name.toLowerCase().trim(), r.id);
		}
		return map;
	}

	/**
	 * Carga attachments para una lista de items por nombre canónico de
	 * Responsabilidad. Los archivos viven globalmente vinculados a
	 * `responsability_attachment.responsabilityName`.
	 */
	private async populateTemplateAttachments<T extends RetreatScheduleItem>(
		items: T[],
	): Promise<T[]> {
		// Attachments by responsability name
		const names = items
			.map((i) => i.responsability?.name)
			.filter((n): n is string => !!n && n.trim().length > 0);
		const byName = names.length
			? await responsabilityAttachmentService.listForNames(names)
			: new Map();

		// Template descriptions: read-only, copied at query time so the UI
		// can show the original guidance from the template (e.g. "Eucaristía
		// privada del equipo para encomendar el retiro al Señor antes de la
		// llegada de los caminantes") without storing duplicates per retreat.
		const templateIds = Array.from(
			new Set(items.map((i) => i.scheduleTemplateId).filter((x): x is string => !!x)),
		);
		const descriptionByTemplateId = new Map<string, string | null>();
		if (templateIds.length) {
			const templates = await this.templateRepo.find({
				where: { id: In(templateIds) },
				select: ['id', 'description'],
			});
			templates.forEach((t) => descriptionByTemplateId.set(t.id, t.description ?? null));
		}

		items.forEach((i) => {
			const n = i.responsability?.name?.trim();
			(i as any).attachments = n ? (byName.get(n) ?? []) : [];
			(i as any).templateDescription = i.scheduleTemplateId
				? descriptionByTemplateId.get(i.scheduleTemplateId) ?? null
				: null;
		});
		return items;
	}

	async listForRetreat(retreatId: string): Promise<RetreatScheduleItem[]> {
		const items = await this.itemRepo.find({
			where: { retreatId },
			relations: ['responsability', 'responsables', 'responsables.participant'],
			order: { startTime: 'ASC' },
		});
		return this.populateTemplateAttachments(items);
	}

	async get(id: string): Promise<RetreatScheduleItem | null> {
		const item = await this.itemRepo.findOne({
			where: { id },
			relations: ['responsability', 'responsables', 'responsables.participant'],
		});
		if (!item) return null;
		const [populated] = await this.populateTemplateAttachments([item]);
		return populated;
	}

	async create(
		retreatId: string,
		data: Partial<RetreatScheduleItem> & { responsableParticipantIds?: string[] },
	): Promise<RetreatScheduleItem> {
		const startTime = data.startTime
			? data.startTime instanceof Date
				? data.startTime
				: new Date(data.startTime)
			: undefined;
		const endTimeInput = data.endTime
			? data.endTime instanceof Date
				? data.endTime
				: new Date(data.endTime)
			: undefined;
		const durationMinutes =
			data.durationMinutes ??
			(startTime && endTimeInput
				? Math.max(0, Math.round((endTimeInput.getTime() - startTime.getTime()) / 60000))
				: 15);
		const endTime =
			endTimeInput ??
			(startTime ? new Date(startTime.getTime() + durationMinutes * 60000) : new Date());

		const entity = this.itemRepo.create({
			retreatId,
			scheduleTemplateId: data.scheduleTemplateId ?? null,
			name: data.name!,
			type: data.type ?? 'otro',
			day: data.day ?? 1,
			startTime: startTime!,
			endTime,
			durationMinutes,
			orderInDay: data.orderInDay ?? 0,
			status: data.status ?? 'pending',
			responsabilityId: data.responsabilityId ?? null,
			location: data.location ?? null,
			notes: data.notes ?? null,
			musicTrackUrl: data.musicTrackUrl ?? null,
			palanquitaNotes: data.palanquitaNotes ?? null,
			planBNotes: data.planBNotes ?? null,
			blocksSantisimoAttendance: data.blocksSantisimoAttendance ?? false,
		});
		const saved = await this.itemRepo.save(entity);

		if (data.responsableParticipantIds?.length) {
			await this.setResponsables(saved.id, data.responsableParticipantIds);
		}

		if (saved.blocksSantisimoAttendance) {
			await this.resolveSantisimoConflicts(retreatId);
		}
		return (await this.get(saved.id))!;
	}

	async update(
		id: string,
		data: Partial<RetreatScheduleItem> & { responsableParticipantIds?: string[] },
	): Promise<RetreatScheduleItem | null> {
		const existing = await this.itemRepo.findOne({ where: { id } });
		if (!existing) throw new ScheduleNotFoundError('item not found');

		const update: Partial<RetreatScheduleItem> = {};
		const dateFields = new Set(['startTime', 'endTime', 'actualStartTime', 'actualEndTime']);
		for (const k of [
			'name',
			'type',
			'day',
			'startTime',
			'endTime',
			'durationMinutes',
			'orderInDay',
			'status',
			'responsabilityId',
			'location',
			'notes',
			'musicTrackUrl',
			'palanquitaNotes',
			'planBNotes',
			'blocksSantisimoAttendance',
			'actualStartTime',
			'actualEndTime',
		] as const) {
			if (data[k] !== undefined) {
				const value = (data as any)[k];
				(update as any)[k] = dateFields.has(k) && value && !(value instanceof Date)
					? new Date(value)
					: value;
			}
		}

		// Keep endTime coherent with startTime + durationMinutes if either changes
		if (update.startTime || update.durationMinutes !== undefined) {
			const start = update.startTime ?? existing.startTime;
			const dur = update.durationMinutes ?? existing.durationMinutes;
			if (!update.endTime) {
				const startDate = start instanceof Date ? start : new Date(start);
				update.endTime = new Date(startDate.getTime() + dur * 60000);
			}
		}

		await this.itemRepo.update(id, update);

		if (data.responsableParticipantIds !== undefined) {
			await this.setResponsables(id, data.responsableParticipantIds);
		}

		const after = await this.get(id);
		emitScheduleUpdated({ retreatId: existing.retreatId, itemId: id });

		// If meal/dinamica timing changed, recompute santisimo windows
		if (
			update.blocksSantisimoAttendance !== undefined ||
			update.startTime ||
			update.endTime ||
			update.durationMinutes !== undefined
		) {
			await this.resolveSantisimoConflicts(existing.retreatId);
		}

		return after;
	}

	async delete(id: string): Promise<boolean> {
		const item = await this.itemRepo.findOne({ where: { id } });
		if (!item) return false;
		const r = await this.itemRepo.delete(id);
		emitScheduleUpdated({ retreatId: item.retreatId, itemId: id });
		if (item.blocksSantisimoAttendance) {
			await this.resolveSantisimoConflicts(item.retreatId);
		}
		return (r.affected ?? 0) > 0;
	}

	async setResponsables(itemId: string, participantIds: string[]): Promise<void> {
		await this.respRepo.delete({ scheduleItemId: itemId });
		if (!participantIds.length) return;
		const rows = participantIds.map((pid) =>
			this.respRepo.create({ scheduleItemId: itemId, participantId: pid }),
		);
		await this.respRepo.save(rows);
	}

	/**
	 * Asigna responsabilidad principal y/o apoyos a múltiples items en bulk.
	 * Cada entrada con responsabilityId definido (incluyendo null para limpiar) actualiza
	 * el item; cada entrada con responsableParticipantIds reemplaza los apoyos del item.
	 * Filtra silenciosamente itemIds que no pertenecen al retiro.
	 */
	async bulkAssignResponsables(
		retreatId: string,
		assignments: Array<{
			itemId: string;
			responsabilityId?: string | null;
			responsableParticipantIds?: string[];
		}>,
	): Promise<{ updated: number; skipped: number }> {
		if (!assignments.length) return { updated: 0, skipped: 0 };

		const itemIds = assignments.map((a) => a.itemId);
		const items = await this.itemRepo.find({ where: { id: In(itemIds), retreatId } });
		const validIds = new Set(items.map((i) => i.id));

		let updated = 0;
		let skipped = 0;

		for (const a of assignments) {
			if (!validIds.has(a.itemId)) {
				skipped++;
				continue;
			}
			if (a.responsabilityId !== undefined) {
				await this.itemRepo.update(a.itemId, {
					responsabilityId: a.responsabilityId,
				});
			}
			if (a.responsableParticipantIds !== undefined) {
				await this.setResponsables(a.itemId, a.responsableParticipantIds);
			}
			emitScheduleUpdated({ retreatId, itemId: a.itemId });
			updated++;
		}

		return { updated, skipped };
	}

	/**
	 * Backfill: para items del retiro que no tienen responsabilityId pero vienen
	 * de un template con responsabilityName, busca la Responsabilidad del retiro
	 * por nombre y vincula. Idempotente.
	 */
	async relinkResponsibilities(
		retreatId: string,
		force = false,
	): Promise<{ linked: number; alreadyLinked: number; noTemplate: number; noMatch: number }> {
		const items = await this.itemRepo.find({ where: { retreatId } });
		const templateIds = Array.from(
			new Set(items.map((i) => i.scheduleTemplateId).filter((x): x is string => !!x)),
		);
		const templates = templateIds.length
			? await this.templateRepo.find({ where: { id: In(templateIds) } })
			: [];
		const templateById = new Map(templates.map((t) => [t.id, t]));
		const respIndex = await this.buildResponsabilityNameIndex(retreatId);

		let linked = 0;
		let alreadyLinked = 0;
		let noTemplate = 0;
		let noMatch = 0;

		for (const item of items) {
			if (item.responsabilityId && !force) {
				alreadyLinked++;
				continue;
			}
			if (!item.scheduleTemplateId) {
				noTemplate++;
				continue;
			}
			const tmpl = templateById.get(item.scheduleTemplateId);
			if (!tmpl?.responsabilityName) {
				noMatch++;
				continue;
			}
			const respId = respIndex.get(tmpl.responsabilityName.toLowerCase().trim());
			if (!respId) {
				noMatch++;
				continue;
			}
			// Skip if already linked to the same responsability (avoid no-op writes)
			if (item.responsabilityId === respId) {
				alreadyLinked++;
				continue;
			}
			await this.itemRepo.update(item.id, { responsabilityId: respId });
			emitScheduleUpdated({ retreatId, itemId: item.id });
			linked++;
		}

		return { linked, alreadyLinked, noTemplate, noMatch };
	}

	/**
	 * Stream a ZIP of all attachments associated with the retreat's items.
	 *
	 * For each item with `responsabilityId`, fetch its attachments via the
	 * canonical name JOIN. Markdowns become `.md` files (`<rol>/<title>.md`),
	 * binary files are streamed as-is from S3 or decoded from data URL.
	 *
	 * Use case: coordinator quiere imprimir o leer offline todos los guiones
	 * antes del retiro. Streaming evita cargar todo en memoria — los archivos
	 * se escriben al output según se van resolviendo.
	 *
	 * Returns the zip "name" suggestion (without extension) so the controller
	 * can set `Content-Disposition`.
	 */
	async streamRetreatBundle(
		retreatId: string,
		output: Writable,
	): Promise<{ fileName: string; itemCount: number; attachmentCount: number }> {
		const retreatRepo = AppDataSource.getRepository(Retreat);
		const retreat = await retreatRepo.findOne({ where: { id: retreatId } });
		if (!retreat) throw new ScheduleNotFoundError('retreat not found');

		const items = await this.itemRepo.find({
			where: { retreatId },
			relations: ['responsability'],
			order: { day: 'ASC', startTime: 'ASC' },
		});

		// Collect unique responsability names to avoid duplicates (the same
		// guion can be referenced by multiple items in the same day).
		const seen = new Set<string>();
		const respNames: string[] = [];
		for (const it of items) {
			const name = it.responsability?.name;
			if (name && !seen.has(name)) {
				seen.add(name);
				respNames.push(name);
			}
		}

		const byName = new Map<string, ResponsabilityAttachment[]>();
		// Resolve all attachments per name (parallel — service.list is small
		// and the canonical-name set is bounded by the template, not by retreat
		// size, so concurrency is safe).
		await Promise.all(
			respNames.map(async (name) => {
				const list = await responsabilityAttachmentService.list(name);
				if (list.length) byName.set(name, list);
			}),
		);

		// File-name slug: ASCII-safe, preserves spaces with underscore for
		// readability, drops other punctuation. Cross-platform safe.
		const slug = (s: string): string =>
			s
				.normalize('NFKD')
				.replace(/[̀-ͯ]/g, '') // drop combining marks
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '_')
				.slice(0, 80) || 'doc';

		const archive = archiver('zip', { zlib: { level: 9 } });
		archive.pipe(output);

		// Helper: append S3 attachment as a real binary stream. Returns false
		// if the fetch failed (caller falls back to `.url.txt`). Per-archive
		// timeout prevents one slow object from stalling the bundle.
		const appendS3Stream = async (
			storageKey: string,
			fileName: string,
			folder: string,
		): Promise<boolean> => {
			try {
				const stream: Readable = await Promise.race([
					s3Service.getObjectStream(storageKey),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('s3 fetch timeout')), 15_000),
					),
				]);
				archive.append(stream, { name: `${folder}/${fileName}` });
				// Wait for archiver to consume the stream before moving on so a
				// failure surfaces here, not silently mid-zip.
				await new Promise<void>((resolve, reject) => {
					stream.on('end', () => resolve());
					stream.on('error', reject);
				});
				return true;
			} catch (err) {
				console.warn(
					`[retreat-bundle] S3 stream failed for key=${storageKey}: ${
						err instanceof Error ? err.message : String(err)
					}. Falling back to .url.txt`,
				);
				return false;
			}
		};

		let attachmentCount = 0;
		const failedS3Keys: string[] = [];
		for (const [name, atts] of byName) {
			const folder = slug(name);
			for (const att of atts) {
				attachmentCount++;
				if (att.kind === 'markdown') {
					const fname = `${slug(att.fileName.replace(/\.md$/i, ''))}.md`;
					archive.append(att.content ?? '', {
						name: `${folder}/${fname}`,
					});
				} else if (att.storageKey) {
					// S3 file: stream the binary directly into the archive so the
					// downloaded ZIP is usable offline. Fall back to a `.url.txt`
					// pointer if the S3 fetch fails (timeout, auth, missing).
					const ok = await appendS3Stream(
						att.storageKey,
						slug(att.fileName),
						folder,
					);
					if (!ok) {
						failedS3Keys.push(att.storageKey);
						archive.append(
							`${att.fileName}\nURL: ${att.storageUrl}\n(El archivo no pudo descargarse de S3 al generar el bundle. Abre la URL para acceder al original.)\n`,
							{ name: `${folder}/${slug(att.fileName)}.url.txt` },
						);
					}
				} else if (att.storageUrl?.startsWith('data:')) {
					// Inline base64 — decode and include as the original binary.
					const match = /^data:([^;]+);base64,(.+)$/.exec(att.storageUrl);
					if (match) {
						const buffer = Buffer.from(match[2], 'base64');
						archive.append(buffer, { name: `${folder}/${slug(att.fileName)}` });
					}
				}
			}
		}

		// Top-level README.md as table of contents.
		const readmeLines: string[] = [
			`# Guiones del retiro: ${retreat.parish}`,
			'',
			`Generado: ${new Date().toISOString()}`,
			`Items: ${items.length}, Responsabilidades con guiones: ${byName.size}, Attachments: ${attachmentCount}`,
		];
		if (failedS3Keys.length) {
			readmeLines.push(
				'',
				`⚠️  ${failedS3Keys.length} archivo(s) S3 no se pudieron descargar — ver \`.url.txt\` correspondientes.`,
			);
		}
		readmeLines.push('', '## Carpetas', '', ...Array.from(byName.keys()).map((n) => `- ${n}/`));
		archive.append(readmeLines.join('\n'), { name: 'README.md' });

		await archive.finalize();

		const fileName = `MaM_${slug(retreat.parish)}_${retreat.startDate.toString().slice(0, 10)}.zip`;
		return { fileName, itemCount: items.length, attachmentCount };
	}

	/**
	 * Public big-screen view of the schedule for a retreat identified by slug.
	 *
	 * No auth required — but the retreat MUST have `isPublic=true`. Returns
	 * a slim shape (no notes, no PII like emails/phones) suitable for
	 * projecting in the salon during the retreat. Used by `/mam/:slug`.
	 *
	 * Returns null if no matching public retreat — controller maps to 404.
	 */
	async getPublicSchedule(
		slug: string,
	): Promise<{
		retreat: { id: string; parish: string; startDate: string; endDate: string };
		items: Array<{
			id: string;
			day: number;
			startTime: string;
			endTime: string;
			durationMinutes: number;
			name: string;
			type: string;
			status: 'pending' | 'active' | 'completed' | 'delayed' | 'skipped';
			location: string | null;
			responsabilityName: string | null;
		}>;
	} | null> {
		const repo = AppDataSource.getRepository(Retreat);
		const retreat = await repo.findOne({ where: { slug } });
		if (!retreat || !retreat.isPublic) return null;

		const items = await this.itemRepo.find({
			where: { retreatId: retreat.id },
			relations: ['responsability'],
			order: { day: 'ASC', startTime: 'ASC' },
		});

		// Defensive ISO conversion: SQLite returns date columns as strings,
		// Postgres as Date instances. Wrap with `new Date(x).toISOString()`
		// to work uniformly across both drivers.
		const toIso = (v: Date | string): string =>
			v instanceof Date ? v.toISOString() : new Date(v).toISOString();

		return {
			retreat: {
				id: retreat.id,
				parish: retreat.parish,
				startDate: toIso(retreat.startDate),
				endDate: toIso(retreat.endDate),
			},
			items: items.map((it) => ({
				id: it.id,
				day: it.day,
				startTime: toIso(it.startTime),
				endTime: toIso(it.endTime),
				durationMinutes: it.durationMinutes,
				name: it.name,
				type: it.type,
				status: it.status,
				location: it.location ?? null,
				// Only the responsability NAME — no participant info, no
				// description, no notes.
				responsabilityName: it.responsability?.name ?? null,
			})),
		};
	}

	/**
	 * Compute the absolute startTime/endTime for a template item given the
	 * retreat's first-day date and the template's day offset / HH:MM.
	 *
	 * The fix here addresses a TZ-shift bug: when the controller parses
	 * `baseDate` from JSON (`new Date("2026-04-26")` → UTC midnight) and we
	 * then call `getDate()` / `setDate()` / `setHours()` (which use
	 * server-local time), a non-UTC server interprets the UTC midnight as
	 * "previous day at 6 PM local" and Day 1 lands on the wrong calendar
	 * date. Treat the input as a calendar date (Y/M/D) by reading its UTC
	 * components, then construct the result in server-local time so HH:MM
	 * still means HH:MM where the server runs (matching coordinator intent).
	 *
	 * On UTC servers (prod) this is a no-op; in non-UTC dev environments it
	 * stops the day-1 shift seen during simulation.
	 */
	private computeItemDateRange(
		baseDate: Date,
		day: number,
		defaultStartTime: string | null | undefined,
		durationMinutes: number,
	): { startTime: Date; endTime: Date } {
		let h = 9;
		let m = 0;
		if (defaultStartTime) {
			const parts = defaultStartTime.split(':');
			h = parseInt(parts[0] ?? '9', 10);
			m = parseInt(parts[1] ?? '0', 10);
		}
		const yyyy = baseDate.getUTCFullYear();
		const mm = baseDate.getUTCMonth();
		const dd = baseDate.getUTCDate();
		// "After-midnight" items (e.g. Polanco's Vigilia at 00:10 on Día 1)
		// are part of the previous logical day's evening flow. Their
		// `defaultDay` stays the same (so the UI groups them under Día N),
		// but on the CALENDAR they're early morning of N+1 — without this
		// shift they sort BEFORE the rest of Día N's items by startTime
		// (e.g. 00:10 < 15:00). Threshold: < 06:00 is treated as next-morning.
		const dayOffset = h < 6 ? day : day - 1;
		const startTime = new Date(yyyy, mm, dd + dayOffset, h, m, 0, 0);
		const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);
		return { startTime, endTime };
	}

	/**
	 * Clone the global template into this retreat. baseDate = first day of retreat.
	 * `defaultDay` (1..n) is mapped to baseDate + (day-1); `defaultStartTime` (HH:MM) is applied.
	 */
	async materializeFromTemplate(
		retreatId: string,
		baseDate: Date,
		clearExisting = false,
		templateSetId?: string,
	): Promise<RetreatScheduleItem[]> {
		const where: any = { isActive: true };
		if (templateSetId) where.templateSetId = templateSetId;
		const templates = await this.templateRepo.find({
			where,
			order: { defaultDay: 'ASC', defaultOrder: 'ASC', defaultStartTime: 'ASC' },
		});
		if (!templates.length) return [];

		if (clearExisting) {
			await this.itemRepo.delete({ retreatId });
		}

		// Crea las Responsabilidades de charlas/testimonios del set escogido que
		// aún no existan en el retiro, ANTES de construir el respIndex para que
		// los items recién creados puedan vincularse en este mismo paso.
		await ensureCharlaResponsibilitiesFromTemplateSet(retreatId, templateSetId);

		const respIndex = await this.buildResponsabilityNameIndex(retreatId);

		const created: RetreatScheduleItem[] = [];
		for (const t of templates) {
			const day = t.defaultDay ?? 1;
			const duration = t.defaultDurationMinutes ?? 15;
			const { startTime, endTime } = this.computeItemDateRange(
				baseDate,
				day,
				t.defaultStartTime,
				duration,
			);

			const responsabilityId = t.responsabilityName
				? respIndex.get(t.responsabilityName.toLowerCase().trim()) ?? null
				: null;

			const entity = this.itemRepo.create({
				retreatId,
				scheduleTemplateId: t.id,
				name: t.name,
				type: t.type,
				day,
				startTime,
				endTime,
				durationMinutes: duration,
				orderInDay: t.defaultOrder,
				status: 'pending',
				responsabilityId,
				musicTrackUrl: t.musicTrackUrl,
				palanquitaNotes: t.palanquitaNotes,
				planBNotes: t.planBNotes,
				blocksSantisimoAttendance: t.blocksSantisimoAttendance,
				location: t.locationHint,
			});
			created.push(await this.itemRepo.save(entity));
		}

		await this.autoGenerateSantisimoSlotsFromItems(retreatId, created);
		await this.resolveSantisimoConflicts(retreatId);
		return this.listForRetreat(retreatId);
	}

	/**
	 * Inserta SOLO los items del template que el retiro aún no tiene materializados.
	 * Detecta duplicados por `scheduleTemplateId` y por `(day, name)` cuando no hay link.
	 * Útil para propagar nuevos items del template a retiros que ya materializaron.
	 */
	async addMissingTemplateItems(
		retreatId: string,
		baseDate: Date,
		templateSetId?: string,
	): Promise<{ added: number; skipped: number; total: number }> {
		const where: any = { isActive: true };
		if (templateSetId) where.templateSetId = templateSetId;
		const templates = await this.templateRepo.find({
			where,
			order: { defaultDay: 'ASC', defaultOrder: 'ASC', defaultStartTime: 'ASC' },
		});
		if (!templates.length) return { added: 0, skipped: 0, total: 0 };

		const existing = await this.itemRepo.find({ where: { retreatId } });
		const existingTemplateIds = new Set(
			existing.map((e) => e.scheduleTemplateId).filter((x): x is string => !!x),
		);
		const existingByDayName = new Set(existing.map((e) => `${e.day}__${e.name?.trim()}`));

		// Asegura las Responsabilidades de charlas/testimonios del set antes de
		// construir el respIndex (ver nota en materializeFromTemplate).
		await ensureCharlaResponsibilitiesFromTemplateSet(retreatId, templateSetId);

		const respIndex = await this.buildResponsabilityNameIndex(retreatId);

		let added = 0;
		let skipped = 0;
		for (const t of templates) {
			if (existingTemplateIds.has(t.id)) {
				skipped++;
				continue;
			}
			if (existingByDayName.has(`${t.defaultDay ?? 1}__${t.name?.trim()}`)) {
				skipped++;
				continue;
			}
			const day = t.defaultDay ?? 1;
			const duration = t.defaultDurationMinutes ?? 15;
			const { startTime, endTime } = this.computeItemDateRange(
				baseDate,
				day,
				t.defaultStartTime,
				duration,
			);
			const responsabilityId = t.responsabilityName
				? respIndex.get(t.responsabilityName.toLowerCase().trim()) ?? null
				: null;

			const entity = this.itemRepo.create({
				retreatId,
				scheduleTemplateId: t.id,
				name: t.name,
				type: t.type,
				day,
				startTime,
				endTime,
				durationMinutes: duration,
				orderInDay: t.defaultOrder,
				status: 'pending',
				responsabilityId,
				musicTrackUrl: t.musicTrackUrl,
				palanquitaNotes: t.palanquitaNotes,
				planBNotes: t.planBNotes,
				blocksSantisimoAttendance: t.blocksSantisimoAttendance,
				location: t.locationHint,
			});
			await this.itemRepo.save(entity);
			added++;
		}

		if (added > 0) {
			const all = await this.itemRepo.find({ where: { retreatId } });
			await this.autoGenerateSantisimoSlotsFromItems(retreatId, all);
			await this.resolveSantisimoConflicts(retreatId);
		}

		return { added, skipped, total: templates.length };
	}

	async startItem(id: string): Promise<RetreatScheduleItem | null> {
		const now = new Date();
		const item = await this.itemRepo.findOne({ where: { id } });
		if (!item) throw new ScheduleNotFoundError('item not found');
		await this.itemRepo.update(id, { status: 'active', actualStartTime: now });
		emitScheduleItemStarted({
			retreatId: item.retreatId,
			itemId: id,
			actualStartTime: now.toISOString(),
		});
		return this.get(id);
	}

	async completeItem(id: string): Promise<RetreatScheduleItem | null> {
		const now = new Date();
		const item = await this.itemRepo.findOne({ where: { id } });
		if (!item) throw new ScheduleNotFoundError('item not found');
		await this.itemRepo.update(id, { status: 'completed', actualEndTime: now });
		emitScheduleItemCompleted({
			retreatId: item.retreatId,
			itemId: id,
			actualEndTime: now.toISOString(),
		});
		return this.get(id);
	}

	/**
	 * Shift every item of a given day in a retreat by `minutesDelta`.
	 *
	 * Used by the coordinator UI when the entire day runs ±N minutes off
	 * (e.g. service starts late, dynamic ran longer than planned). All items
	 * shift by the same amount in a single transaction; statuses are NOT
	 * touched — this is a reschedule, not a delay-cascade like
	 * `shiftDownstream`.
	 */
	async shiftDay(
		retreatId: string,
		day: number,
		minutesDelta: number,
	): Promise<RetreatScheduleItem[]> {
		const items = await this.itemRepo.find({
			where: { retreatId, day },
		});
		if (!items.length) return [];
		await AppDataSource.transaction(async (manager) => {
			const repo = manager.getRepository(RetreatScheduleItem);
			for (const x of items) {
				await repo.update(x.id, {
					startTime: new Date(x.startTime.getTime() + minutesDelta * 60000),
					endTime: new Date(x.endTime.getTime() + minutesDelta * 60000),
				});
			}
		});
		await this.resolveSantisimoConflicts(retreatId);
		return this.listForRetreat(retreatId);
	}

	/**
	 * Shift ALL items of a retreat by the same delta. Used when the retreat's
	 * `startDate` changes — items move with it, preserving time-of-day and
	 * day numbering. SQLite stores datetime as strings; defensive parsing
	 * handles both Date and string inputs.
	 */
	async shiftAllItems(
		retreatId: string,
		minutesDelta: number,
	): Promise<RetreatScheduleItem[]> {
		if (minutesDelta === 0) return this.listForRetreat(retreatId);
		const items = await this.itemRepo.find({ where: { retreatId } });
		if (!items.length) return [];
		const toMs = (v: Date | string): number => {
			const d = v instanceof Date ? v : new Date(v);
			return d.getTime();
		};
		await AppDataSource.transaction(async (manager) => {
			const repo = manager.getRepository(RetreatScheduleItem);
			for (const x of items) {
				await repo.update(x.id, {
					startTime: new Date(toMs(x.startTime) + minutesDelta * 60000),
					endTime: new Date(toMs(x.endTime) + minutesDelta * 60000),
				});
			}
		});
		await this.resolveSantisimoConflicts(retreatId);
		return this.listForRetreat(retreatId);
	}

	/**
	 * Reorder items within a single day. Keeps the same time slots (startTime/endTime
	 * pairs already in use that day) but reassigns which item occupies which slot
	 * according to the user's drag-and-drop order.
	 *
	 * `orderedItemIds` must contain exactly the IDs of the items already on that
	 * `(retreatId, day)`, no more, no less. Out-of-set or missing IDs raise an error.
	 *
	 * Concretely: items[0] (originally earliest) gets the time slot of the first
	 * id in `orderedItemIds`, items[1] the second, etc.
	 */
	async reorderDay(
		retreatId: string,
		day: number,
		orderedItemIds: string[],
	): Promise<RetreatScheduleItem[]> {
		const dayItems = await this.itemRepo.find({ where: { retreatId, day } });
		if (!dayItems.length) return [];

		// Validate: same set of ids
		const dayIds = new Set(dayItems.map((x) => x.id));
		if (orderedItemIds.length !== dayItems.length) {
			throw new Error(
				`reorder mismatch: day has ${dayItems.length} items, received ${orderedItemIds.length}`,
			);
		}
		for (const id of orderedItemIds) {
			if (!dayIds.has(id)) {
				throw new Error(`reorder mismatch: id ${id} is not in day ${day}`);
			}
		}
		if (new Set(orderedItemIds).size !== orderedItemIds.length) {
			throw new Error('reorder mismatch: duplicate ids');
		}

		// Canonical slots = current items sorted by startTime ascending.
		const slots = [...dayItems].sort(
			(a, b) => a.startTime.getTime() - b.startTime.getTime(),
		);

		await AppDataSource.transaction(async (manager) => {
			const repo = manager.getRepository(RetreatScheduleItem);
			for (let i = 0; i < orderedItemIds.length; i++) {
				const slot = slots[i];
				await repo.update(orderedItemIds[i], {
					startTime: slot.startTime,
					endTime: slot.endTime,
					durationMinutes: slot.durationMinutes,
					orderInDay: i,
				});
			}
		});

		emitScheduleUpdated({ retreatId, itemId: orderedItemIds[0] });
		await this.resolveSantisimoConflicts(retreatId);
		return this.listForRetreat(retreatId);
	}

	/**
	 * Shift this item and (optionally) all later items on the same day by `minutesDelta`.
	 */
	async shiftDownstream(
		id: string,
		minutesDelta: number,
		propagate = true,
	): Promise<RetreatScheduleItem[]> {
		const item = await this.itemRepo.findOne({ where: { id } });
		if (!item) throw new ScheduleNotFoundError('item not found');

		const affected: RetreatScheduleItem[] = [item];
		if (propagate) {
			const later = await this.itemRepo.find({
				where: {
					retreatId: item.retreatId,
					day: item.day,
					startTime: MoreThanOrEqual(item.startTime),
				},
			});
			for (const x of later) {
				if (x.id !== item.id) affected.push(x);
			}
		}

		for (const x of affected) {
			const newStart = new Date(x.startTime.getTime() + minutesDelta * 60000);
			const newEnd = new Date(x.endTime.getTime() + minutesDelta * 60000);
			await this.itemRepo.update(x.id, {
				startTime: newStart,
				endTime: newEnd,
				status: minutesDelta > 0 ? 'delayed' : x.status,
			});
		}

		emitScheduleDelay({ retreatId: item.retreatId, itemId: id, minutesDelta });
		await this.resolveSantisimoConflicts(item.retreatId);
		return this.listForRetreat(item.retreatId);
	}

	/**
	 * Si el template materializado tiene items de tipo 'santisimo', genera los
	 * SantisimoSlot cubriendo de min(startTime) a max(endTime) de esos items
	 * (el "horario completo" del santísimo según el template). Slots de 60 min,
	 * capacidad 1. Idempotente: el índice único (retreatId,startTime) +
	 * try/catch SQLITE_CONSTRAINT preserva los signups previos. La lógica se
	 * inlinea aquí (no se delega a santisimoService) para reutilizar
	 * `this.slotRepo`, cuya bind a AppDataSource respeta el rewire de testing.
	 */
	private async autoGenerateSantisimoSlotsFromItems(
		retreatId: string,
		items: RetreatScheduleItem[],
	): Promise<void> {
		const santisimoItems = items.filter((it) => it.type === 'santisimo');
		if (!santisimoItems.length) return;

		const toMs = (v: Date | string): number =>
			(v instanceof Date ? v : new Date(v)).getTime();

		let startMs = toMs(santisimoItems[0].startTime);
		let endMs = toMs(santisimoItems[0].endTime);
		for (const it of santisimoItems) {
			const s = toMs(it.startTime);
			const e = toMs(it.endTime);
			if (s < startMs) startMs = s;
			if (e > endMs) endMs = e;
		}
		if (endMs <= startMs) return;

		const slotMinutes = 60;
		for (let cursor = startMs; cursor < endMs; cursor += slotMinutes * 60_000) {
			const next = cursor + slotMinutes * 60_000;
			const slotEnd = next > endMs ? endMs : next;
			const slot = this.slotRepo.create({
				retreatId,
				startTime: new Date(cursor),
				endTime: new Date(slotEnd),
				capacity: 1,
				isDisabled: false,
			});
			try {
				await this.slotRepo.save(slot);
			} catch (err: any) {
				if (err?.code === 'SQLITE_CONSTRAINT' || /UNIQUE/i.test(err?.message || '')) {
					continue;
				}
				throw err;
			}
		}
	}

	/**
	 * Mark santisimo slots that overlap a "blocking" item window (comida/dinamica with
	 * blocksSantisimoAttendance=true) and auto-fill them with angelitos if available.
	 *
	 * Also detects "responsable conflicts": a signup whose participant is the responsable
	 * (or apoyo) of any schedule item whose time window overlaps the santísimo slot.
	 * Example: charlista signed up to cover Santísimo at 17:00 but they're giving a charla
	 * 16:30–17:30 — they cannot physically be in two places. Such signups are removed and
	 * the slot's `mealSlots` count plus per-slot list track the consequence.
	 */
	async resolveSantisimoConflicts(
		retreatId: string,
	): Promise<{
		mealSlots: number;
		angelitosAssigned: number;
		unresolvedSlots: string[];
		responsableConflicts: number;
	}> {
		const blockers = await this.itemRepo.find({
			where: { retreatId, blocksSantisimoAttendance: true },
		});
		const slots = await this.slotRepo.find({
			where: { retreatId },
			relations: ['signups'],
		});

		const mealSlotIds: string[] = [];
		for (const slot of slots) {
			const overlaps = blockers.some(
				(b) => b.startTime < slot.endTime && b.endTime > slot.startTime,
			);
			const nextValue = !!overlaps;
			if (slot.mealWindow !== nextValue) {
				await this.slotRepo.update(slot.id, { mealWindow: nextValue });
				slot.mealWindow = nextValue;
			}
			if (nextValue) mealSlotIds.push(slot.id);
		}

		const responsableConflicts = await this.removeResponsableConflicts(retreatId, slots);

		if (!mealSlotIds.length) {
			return {
				mealSlots: 0,
				angelitosAssigned: 0,
				unresolvedSlots: [],
				responsableConflicts,
			};
		}

		const assigned = await this.autoAssignAngelitos(retreatId, mealSlotIds);
		return {
			mealSlots: mealSlotIds.length,
			angelitosAssigned: assigned.assigned,
			unresolvedSlots: assigned.unresolved,
			responsableConflicts,
		};
	}

	/**
	 * Detect signups whose participant is the main responsable (or listed in apoyos)
	 * of an item whose time window overlaps the slot. Such signups are unfeasible
	 * (the participant has a competing duty) and are removed.
	 *
	 * Returns the count of removed signups so the caller can surface the number to
	 * the coordinator (e.g. "removí 3 inscripciones por conflicto con responsabilidades").
	 */
	private async removeResponsableConflicts(
		retreatId: string,
		slots: SantisimoSlot[],
	): Promise<number> {
		if (!slots.length) return 0;

		const items = await this.itemRepo.find({
			where: { retreatId },
			relations: ['responsability', 'responsables'],
		});
		if (!items.length) return 0;

		// Build map: participantId → array of {start, end} time-windows where they have a duty.
		const dutyByParticipant = new Map<string, Array<{ start: Date; end: Date }>>();
		const addDuty = (pid: string | null | undefined, start: Date, end: Date) => {
			if (!pid) return;
			const list = dutyByParticipant.get(pid) ?? [];
			list.push({ start, end });
			dutyByParticipant.set(pid, list);
		};

		for (const it of items) {
			addDuty(it.responsability?.participantId ?? null, it.startTime, it.endTime);
			for (const apoyo of it.responsables ?? []) {
				addDuty(apoyo.participantId ?? null, it.startTime, it.endTime);
			}
		}

		let removed = 0;
		for (const slot of slots) {
			for (const sig of slot.signups ?? []) {
				if (!sig.participantId) continue;
				const duties = dutyByParticipant.get(sig.participantId);
				if (!duties) continue;
				const conflicts = duties.some(
					(d) => d.start < slot.endTime && d.end > slot.startTime,
				);
				if (conflicts) {
					await this.signupRepo.delete(sig.id);
					removed++;
				}
			}
		}
		return removed;
	}

	/**
	 * For meal-window slots, remove signups of servidores-en-mesa (they cannot attend)
	 * and auto-assign available angelitos.
	 *
	 * Definition of "angelito" in this system: a Participant with `type === 'partial_server'`
	 * (this is the canonical field set by admins via the participant edit form, where the
	 * value is rendered in Spanish as "Angelito"). We additionally require they not be
	 * currently seated at any mesa for this retreat (a servidor en mesa can't cover Santísimo
	 * during their own meal).
	 */
	async autoAssignAngelitos(
		retreatId: string,
		slotIds?: string[],
	): Promise<{ assigned: number; unresolved: string[] }> {
		const whereSlot = slotIds?.length
			? { retreatId, id: In(slotIds), mealWindow: true }
			: { retreatId, mealWindow: true };
		const mealSlots = await this.slotRepo.find({
			where: whereSlot,
			relations: ['signups'],
		});

		// Participants currently seated at any mesa for this retreat are ineligible.
		const inTableRows = await this.participantRepo.manager
			.createQueryBuilder()
			.select('rp.participantId', 'participantId')
			.from('retreat_participants', 'rp')
			.where('rp.retreatId = :retreatId', { retreatId })
			.andWhere('rp.tableId IS NOT NULL')
			.andWhere('rp.participantId IS NOT NULL')
			.getRawMany();
		const inTableIds = new Set<string>(
			inTableRows.map((r: { participantId: string }) => r.participantId).filter(Boolean),
		);

		// Candidate angelitos: retreat_participants of this retreat with type='partial_server'
		// (the system's canonical "Angelito"). We join to participants for full data.
		const angelitoLinks = await this.participantRepo.manager
			.createQueryBuilder()
			.select('rp.participantId', 'participantId')
			.from('retreat_participants', 'rp')
			.where('rp.retreatId = :retreatId', { retreatId })
			.andWhere('rp.type = :t', { t: 'partial_server' })
			.andWhere('rp.participantId IS NOT NULL')
			.getRawMany();
		const angelitoPids = angelitoLinks
			.map((r: { participantId: string }) => r.participantId)
			.filter(Boolean);
		const allP = angelitoPids.length
			? await this.participantRepo
					.createQueryBuilder('p')
					.where('p.id IN (:...ids)', { ids: angelitoPids })
					.getMany()
			: [];

		const pool = allP.filter((p) => !inTableIds.has(p.id));
		if (!pool.length && !mealSlots.length) return { assigned: 0, unresolved: [] };

		// Limpia auto-asignaciones previas en TODOS los slots mealWindow para
		// rebalancear desde cero — sin esto, slots ya llenos con un mismo
		// angelito sobreviven (need=0) y nunca se redistribuyen. Sólo borra los
		// signups con autoAssigned=true; las inscripciones manuales (signups del
		// admin con o sin participantId) se preservan. También limpia signups de
		// servidores que ahora están en mesa (no pueden cubrir durante la comida).
		for (const slot of mealSlots) {
			for (const sig of slot.signups ?? []) {
				const isStaleAuto = sig.autoAssigned === true;
				const isInTableNow = !!sig.participantId && inTableIds.has(sig.participantId);
				if (isStaleAuto || isInTableNow) {
					await this.signupRepo.delete(sig.id);
				}
			}
		}

		// Ahora cuenta los signups NO-borrados (manuales del admin) por angelito.
		// Sirve como peso inicial para que la distribución no apile más sobre
		// alguien que ya tiene asignaciones manuales.
		const usedCount = new Map<string, number>();
		for (const p of pool) usedCount.set(p.id, 0);
		for (const slot of mealSlots) {
			const remaining = await this.signupRepo.find({ where: { slotId: slot.id } });
			for (const sig of remaining) {
				if (sig.participantId && usedCount.has(sig.participantId)) {
					usedCount.set(sig.participantId, (usedCount.get(sig.participantId) ?? 0) + 1);
				}
			}
		}

		let assigned = 0;
		const unresolved: string[] = [];

		for (const slot of mealSlots) {
			const refreshed = await this.signupRepo.find({ where: { slotId: slot.id } });
			const need = Math.max(0, slot.capacity - refreshed.length);
			if (need === 0) continue;

			const taken = new Set(refreshed.map((s) => s.participantId).filter(Boolean) as string[]);
			const candidates = pool
				.filter((p) => !taken.has(p.id))
				.sort((a, b) => (usedCount.get(a.id) ?? 0) - (usedCount.get(b.id) ?? 0));

			if (!candidates.length) {
				unresolved.push(slot.id);
				continue;
			}

			for (let i = 0; i < need && i < candidates.length; i++) {
				const p = candidates[i];
				const row = this.signupRepo.create({
					slotId: slot.id,
					participantId: p.id,
					name: `${p.firstName} ${p.lastName}`.trim() || p.nickname,
					phone: p.cellPhone ?? null,
					email: p.email ?? null,
					userId: null,
					cancelToken: null,
					ipAddress: null,
					isAngelito: true,
					autoAssigned: true,
				});
				await this.signupRepo.save(row);
				usedCount.set(p.id, (usedCount.get(p.id) ?? 0) + 1);
				assigned++;
			}
			if (need > candidates.length) unresolved.push(slot.id);
		}

		return { assigned, unresolved };
	}

	/**
	 * Aggregated dashboard stats for the retreat. Single read-only call covering
	 * agenda progress, current/next item, santisimo coverage and angelito pool.
	 */
	async dashboardStats(retreatId: string) {
		const items = await this.itemRepo.find({
			where: { retreatId },
			relations: ['responsability', 'responsables'],
			order: { startTime: 'ASC' },
		});

		const now = new Date();
		const todayStart = new Date(now);
		todayStart.setHours(0, 0, 0, 0);
		const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

		const todayItems = items.filter(
			(it) => it.startTime >= todayStart && it.startTime < todayEnd,
		);
		const completedToday = todayItems.filter((it) => it.status === 'completed').length;
		const totalToday = todayItems.length;

		const requiresResponsable = items.filter(
			(it) =>
				it.responsability !== null ||
				(it.responsables && it.responsables.length > 0) ||
				it.scheduleTemplateId,
		).length;
		const missingResponsable = items.filter(
			(it) =>
				!it.responsabilityId &&
				(!it.responsables || it.responsables.length === 0) &&
				(it.type === 'charla' || it.type === 'testimonio' || it.type === 'misa'),
		).length;

		const currentItem = items.find((it) => it.status === 'active') ?? null;
		const nextItem =
			items.find(
				(it) => (it.status === 'pending' || it.status === 'delayed') && it.startTime > now,
			) ?? null;

		// Acumulado de retraso del día: suma de minutos en items 'delayed' o
		// completed con actualEndTime > endTime planeado.
		let delayMinutes = 0;
		for (const it of todayItems) {
			if (it.status === 'completed' && it.actualEndTime) {
				const diff = Math.round((it.actualEndTime.getTime() - it.endTime.getTime()) / 60000);
				if (diff > 0) delayMinutes += diff;
			}
		}

		// Santísimo
		const slots = await this.slotRepo.find({
			where: { retreatId },
			relations: ['signups'],
		});
		const totalSlots = slots.length;
		const coveredSlots = slots.filter((s) => (s.signups?.length ?? 0) >= s.capacity).length;
		const mealWindowSlots = slots.filter((s) => s.mealWindow).length;
		const unresolvedMealSlots = slots.filter(
			(s) => s.mealWindow && (s.signups?.length ?? 0) < s.capacity,
		).length;

		// Angelitos
		const inTableP = await this.participantRepo.manager
			.createQueryBuilder()
			.select('rp.participantId', 'participantId')
			.from('retreat_participants', 'rp')
			.where('rp.retreatId = :retreatId', { retreatId })
			.andWhere('rp.tableId IS NOT NULL')
			.andWhere('rp.participantId IS NOT NULL')
			.getRawMany();
		const inTableIds = new Set<string>(
			inTableP.map((r: { participantId: string }) => r.participantId).filter(Boolean),
		);
		const angelitoRows = await this.participantRepo.manager
			.createQueryBuilder()
			.select('rp.participantId', 'participantId')
			.from('retreat_participants', 'rp')
			.where('rp.retreatId = :retreatId', { retreatId })
			.andWhere('rp.type = :t', { t: 'partial_server' })
			.andWhere('rp.participantId IS NOT NULL')
			.getRawMany();
		const angelitoIds = angelitoRows
			.map((r: { participantId: string }) => r.participantId)
			.filter(Boolean);
		const angelitosTotal = angelitoIds.length;
		const angelitosInTable = angelitoIds.filter((id: string) => inTableIds.has(id)).length;
		const angelitosAvailable = angelitosTotal - angelitosInTable;

		return {
			currentItem: currentItem
				? {
						id: currentItem.id,
						name: currentItem.name,
						type: currentItem.type,
						startTime: currentItem.startTime.toISOString(),
						endTime: currentItem.endTime.toISOString(),
						actualStartTime: currentItem.actualStartTime?.toISOString() ?? null,
						durationMinutes: currentItem.durationMinutes,
						responsabilityId: currentItem.responsabilityId ?? null,
						responsabilityName: currentItem.responsability?.name ?? null,
				  }
				: null,
			nextItem: nextItem
				? {
						id: nextItem.id,
						name: nextItem.name,
						type: nextItem.type,
						startTime: nextItem.startTime.toISOString(),
						minutesUntil: Math.round((nextItem.startTime.getTime() - now.getTime()) / 60000),
						responsabilityName: nextItem.responsability?.name ?? null,
				  }
				: null,
			today: {
				completed: completedToday,
				total: totalToday,
			},
			items: {
				total: items.length,
				completed: items.filter((it) => it.status === 'completed').length,
				active: items.filter((it) => it.status === 'active').length,
				pending: items.filter((it) => it.status === 'pending').length,
				delayed: items.filter((it) => it.status === 'delayed').length,
				requiresResponsable,
				missingResponsable,
			},
			delayMinutes,
			santisimo: {
				totalSlots,
				coveredSlots,
				mealWindowSlots,
				unresolvedMealSlots,
			},
			angelitos: {
				total: angelitosTotal,
				available: angelitosAvailable,
				inTable: angelitosInTable,
			},
		};
	}

	/**
	 * Returns items scheduled to start within the next `leadMinutes` window (pending only).
	 * Used by the realtime tick to emit `schedule:upcoming`.
	 */
	async listUpcoming(leadMinutes: number): Promise<
		Array<RetreatScheduleItem & { targetParticipantIds: string[] }>
	> {
		const now = new Date();
		const until = new Date(now.getTime() + leadMinutes * 60000);
		const rows = await this.itemRepo
			.createQueryBuilder('i')
			.leftJoinAndSelect('i.responsables', 'r')
			.where('i.status = :s', { s: 'pending' })
			.andWhere('i.startTime >= :now', { now })
			.andWhere('i.startTime <= :until', { until })
			.getMany();

		return rows.map((r) => ({
			...r,
			targetParticipantIds: (r.responsables ?? []).map((x) => x.participantId),
		}));
	}
}

export const retreatScheduleService = new RetreatScheduleService();
