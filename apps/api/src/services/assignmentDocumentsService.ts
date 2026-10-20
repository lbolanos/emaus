import { In } from 'typeorm';
import type {
	AssignmentDocumentData,
	AssignmentDocumentsData,
	AssignmentTableData,
} from '@repo/utils';
import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import { RetreatScheduleItem } from '../entities/retreatScheduleItem.entity';
import { ScheduleTemplate } from '../entities/scheduleTemplate.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { Responsability } from '../entities/responsability.entity';
import type { ResponsabilityAttachment } from '../entities/responsabilityAttachment.entity';
import { responsabilityAttachmentService } from './responsabilityAttachmentService';
import { resolveScheduleItemDocumentName } from '../utils/scheduleItemDocument';
import { resolveSafeTimeZone } from '../utils/date.transformer';

// Solo el equipo servidor recibe documentos de dinámicas (R6): nunca un caminante.
const SERVER_TYPES = ['server', 'partial_server'];

const emptyDocuments = (): AssignmentDocumentsData => ({
	moments: [],
	responsibilityDocuments: [],
	table: null,
});

const toDocument = (a: ResponsabilityAttachment): AssignmentDocumentData => ({
	label: a.description?.trim() || a.fileName.replace(/\.[^.]+$/, ''),
	url: a.storageUrl,
});

/** "Viernes" + "20:57" en la zona del retiro (R7). */
function formatMoment(start: Date, timeZone: string): { dayLabel: string; time: string } {
	const weekday = new Intl.DateTimeFormat('es-MX', { timeZone, weekday: 'long' }).format(start);
	const time = new Intl.DateTimeFormat('es-MX', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).format(start);
	return { dayLabel: weekday.charAt(0).toUpperCase() + weekday.slice(1), time };
}

/**
 * Momentos del Minuto a Minuto y documentos de cada servidor de un retiro
 * (specs/assignment-documents). Única fuente para el envío manual (endpoint),
 * el motor de secuencias y el preview.
 *
 * - Un momento le toca a sus responsables y al titular de su responsabilidad
 *   (D2); si su plantilla tiene `documentAudience = 'table_leaders'`, también a
 *   todos los líderes y colíderes de mesa (D3).
 * - Su documento sale de `resolveScheduleItemDocumentName` (D1) y solo viajan
 *   archivos con link http(s) (D4).
 * - Las responsabilidades cuyo documento no llega por ningún momento del
 *   servidor van aparte, en `responsibilityDocuments`.
 */
export class AssignmentDocumentsService {
	async forRetreat(retreatId: string): Promise<Map<string, AssignmentDocumentsData>> {
		const result = new Map<string, AssignmentDocumentsData>();
		const retreat = await AppDataSource.getRepository(Retreat).findOne({
			where: { id: retreatId },
			relations: ['house'],
		});
		if (!retreat) return result;
		const timeZone = resolveSafeTimeZone(retreat.timezone || (retreat as any).house?.timezone);

		const [servers, items, tables, responsibilities] = await Promise.all([
			AppDataSource.getRepository(RetreatParticipant).find({
				where: { retreatId, isCancelled: false, type: In(SERVER_TYPES) },
				select: ['participantId'],
			}),
			AppDataSource.getRepository(RetreatScheduleItem).find({
				where: { retreatId },
				relations: ['responsability', 'responsables'],
				order: { startTime: 'ASC' },
			}),
			AppDataSource.getRepository(TableMesa).find({ where: { retreatId } }),
			AppDataSource.getRepository(Responsability).find({ where: { retreatId, isActive: true } }),
		]);
		const activeServers = new Set(
			servers.map((s) => s.participantId).filter((id): id is string => !!id),
		);

		const templateIds = Array.from(
			new Set(items.map((i) => i.scheduleTemplateId).filter((x): x is string => !!x)),
		);
		const templateById = new Map<string, ScheduleTemplate>();
		if (templateIds.length) {
			const templates = await AppDataSource.getRepository(ScheduleTemplate).find({
				where: { id: In(templateIds) },
				select: ['id', 'documentName', 'documentAudience', 'responsabilityName'],
			});
			templates.forEach((t) => templateById.set(t.id, t));
		}

		// Líder o colíder: el primer rol que aparezca gana (una persona, una mesa).
		const tableByLeader = new Map<string, AssignmentTableData>();
		for (const t of tables) {
			const roles: Array<[string | undefined, string]> = [
				[t.liderId, 'líder'],
				[t.colider1Id, 'colíder'],
				[t.colider2Id, 'colíder'],
			];
			for (const [id, role] of roles) {
				if (id && !tableByLeader.has(id)) tableByLeader.set(id, { name: t.name, role });
			}
		}

		const documentNameByItem = new Map(
			items.map((i) => [
				i.id,
				resolveScheduleItemDocumentName(
					i.responsability?.name,
					i.scheduleTemplateId ? templateById.get(i.scheduleTemplateId) : null,
				),
			]),
		);
		const files = await responsabilityAttachmentService.listShareableFilesForNames([
			...Array.from(documentNameByItem.values()).filter((n): n is string => !!n),
			...responsibilities.map((r) => r.name),
		]);
		// The map is keyed by trimmed names (listShareableFilesForNames normalizes).
		const documentsOf = (name: string | null) =>
			(name ? (files.get(name.trim()) ?? []) : []).map(toDocument);

		const entryFor = (participantId: string) => {
			let entry = result.get(participantId);
			if (!entry) {
				entry = emptyDocuments();
				result.set(participantId, entry);
			}
			return entry;
		};
		// Documentos que ya le llegan a cada servidor por un momento.
		const coveredNames = new Map<string, Set<string>>();
		const cover = (participantId: string, name: string | null) => {
			if (!name) return;
			const set = coveredNames.get(participantId) ?? new Set<string>();
			set.add(name);
			coveredNames.set(participantId, set);
		};

		for (const item of items) {
			const documentName = documentNameByItem.get(item.id) ?? null;
			const moment = {
				...formatMoment(new Date(item.startTime), timeZone),
				name: item.name,
				documents: documentsOf(documentName),
			};
			const responsibleIds = new Set(
				[...(item.responsables ?? []).map((r) => r.participantId), item.responsability?.participantId].filter(
					(id): id is string => !!id && activeServers.has(id),
				),
			);
			for (const participantId of responsibleIds) {
				entryFor(participantId).moments.push({ ...moment });
				cover(participantId, documentName);
			}
			const template = item.scheduleTemplateId ? templateById.get(item.scheduleTemplateId) : null;
			if (template?.documentAudience === 'table_leaders') {
				for (const [participantId, table] of tableByLeader) {
					if (!activeServers.has(participantId) || responsibleIds.has(participantId)) continue;
					const entry = entryFor(participantId);
					entry.moments.push({ ...moment, forTable: true });
					entry.table = table;
					cover(participantId, documentName);
				}
			}
		}

		for (const r of responsibilities) {
			if (!r.participantId || !activeServers.has(r.participantId)) continue;
			if (coveredNames.get(r.participantId)?.has(r.name.trim())) continue;
			const documents = documentsOf(r.name);
			if (!documents.length) continue;
			entryFor(r.participantId).responsibilityDocuments.push({ name: r.name.trim(), documents });
		}

		return result;
	}

	// The sequence engine resolves recipients one at a time; without this each
	// one rebuilt the whole retreat. A short window keeps a run on one build.
	private static readonly RETREAT_CACHE_TTL_MS = 30_000;
	private retreatCache = new Map<
		string,
		{ at: number; data: Promise<Map<string, AssignmentDocumentsData>> }
	>();

	/** Lo de un servidor; vacío para quien no sea servidor activo del retiro (R6). */
	async forParticipant(retreatId: string, participantId: string): Promise<AssignmentDocumentsData> {
		const now = Date.now();
		let cached = this.retreatCache.get(retreatId);
		if (!cached || now - cached.at > AssignmentDocumentsService.RETREAT_CACHE_TTL_MS) {
			const entry = { at: now, data: this.forRetreat(retreatId) };
			this.retreatCache.set(retreatId, entry);
			// A failed build must not be served from the cache.
			entry.data.catch(() => {
				if (this.retreatCache.get(retreatId) === entry) this.retreatCache.delete(retreatId);
			});
			cached = entry;
		}
		return (await cached.data).get(participantId) ?? emptyDocuments();
	}
}

export const assignmentDocumentsService = new AssignmentDocumentsService();
