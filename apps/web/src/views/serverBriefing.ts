import type { Participant, Responsability, ServiceTeam } from '@repo/types';
import type { AssignmentDocumentsData } from '@repo/utils';
import type { RetreatScheduleItemDTO } from '@/services/api';
import type { AssignmentsData } from '@/utils/message';
import { buildAssignmentsData } from '@/utils/serverAssignments';
import { participantLabel } from '@/utils/participant';

/**
 * Cruce minuto a minuto × funciones que pidió el coordinador (2026-11-06):
 * "elegir en qué estamos, seleccionar el servidor, y que detaille dónde debe
 * estar y qué debe estar haciendo".
 *
 * Helpers puros (sin Vue) para que el cruce se teste sin montar la vista,
 * mismo precedente que mamTime.ts / mamCollapse.ts.
 */

export interface BriefingItemEntry {
	item: RetreatScheduleItemDTO;
	roles: string[];
}

export interface ServerBriefing {
	participantId: string;
	label: string;
	/** Está asignado al item elegido (responsable o titular). */
	onStage: boolean;
	rolesHere: string[];
	/** Su próximo momento del día del item elegido, después del elegido. */
	nextMoment: BriefingItemEntry | null;
	/** Su día completo (el día del item elegido), por hora. */
	dayItems: BriefingItemEntry[];
	/** Responsabilidades fijas + equipos con instrucciones (buildAssignmentsData). */
	assignments: AssignmentsData;
	/** Momentos con documentos y mesa, del endpoint assignment-documents. */
	documents: AssignmentDocumentsData | null;
}

/** Comparador numérico para sort: (día, hora de inicio) ascendente. */
const startsBefore = (a: RetreatScheduleItemDTO, b: RetreatScheduleItemDTO): number =>
	a.day !== b.day ? a.day - b.day : a.startTime.localeCompare(b.startTime);

/**
 * El item "en el que estamos": el primero en status `active` por (día, hora).
 * Depende de que el coordinador pulse Iniciar en el Minuto a Minuto — no hay
 * fallback por reloj a propósito.
 */
export function pickAutoItem(items: RetreatScheduleItemDTO[]): RetreatScheduleItemDTO | null {
	const actives = items.filter((i) => i.status === 'active');
	if (actives.length === 0) return null;
	return actives.sort(startsBefore)[0] ?? null;
}

/** Roles de un participante en un item: titular de la responsabilidad + apoyos. */
export function rolesInItem(
	item: RetreatScheduleItemDTO,
	participantId: string,
	responsibilities: Responsability[],
): string[] {
	const roles: string[] = [];
	const holder = item.responsabilityId
		? responsibilities.find((r) => r.id === item.responsabilityId)
		: undefined;
	if (holder && holder.participantId === participantId) {
		roles.push(`${holder.name} (titular)`);
	}
	for (const r of item.responsables ?? []) {
		if (r.participantId === participantId) {
			roles.push(r.role?.trim() || 'Apoyo');
		}
	}
	return roles;
}

export function buildBriefings(args: {
	items: RetreatScheduleItemDTO[];
	chosenItem: RetreatScheduleItemDTO | null;
	servers: Participant[];
	responsibilities: Responsability[];
	teams: ServiceTeam[];
	documents: Record<string, AssignmentDocumentsData> | null;
}): { onStage: ServerBriefing[]; others: ServerBriefing[] } {
	const { items, chosenItem, servers, responsibilities, teams, documents } = args;

	// Una pasada por los items: indexa las entradas por participante, combinando
	// los roles cuando alguien es titular Y responsable del mismo item.
	const entriesByParticipant = new Map<string, BriefingItemEntry[]>();
	const addEntry = (participantId: string, item: RetreatScheduleItemDTO, role: string) => {
		let list = entriesByParticipant.get(participantId);
		if (!list) {
			list = [];
			entriesByParticipant.set(participantId, list);
		}
		let entry = list.find((e) => e.item.id === item.id);
		if (!entry) {
			entry = { item, roles: [] };
			list.push(entry);
		}
		if (!entry.roles.includes(role)) entry.roles.push(role);
	};

	for (const item of items) {
		// El titular va primero en los roles; después los apoyos.
		const holder = item.responsabilityId
			? responsibilities.find((r) => r.id === item.responsabilityId)
			: undefined;
		if (holder?.participantId) addEntry(holder.participantId, item, `${holder.name} (titular)`);
		for (const r of item.responsables ?? []) {
			addEntry(r.participantId, item, r.role?.trim() || 'Apoyo');
		}
	}

	const briefings: ServerBriefing[] = [];
	for (const participant of servers) {
		// Mismo criterio que el backend para "servidor" (assignmentDocumentsService);
		// sin esto los caminantes y cancelados colarían como entradas fantasma.
		if (participant.isCancelled) continue;
		if (participant.type !== 'server' && participant.type !== 'partial_server') continue;

		const pid = participant.id;
		const entries = entriesByParticipant.get(pid) ?? [];
		const onStage = !!chosenItem && entries.some((e) => e.item.id === chosenItem.id);
		const rolesHere =
			onStage && chosenItem ? (entries.find((e) => e.item.id === chosenItem.id)?.roles ?? []) : [];
		const dayItems = chosenItem
			? entries
					.filter((e) => e.item.day === chosenItem.day)
					.sort((a, b) => a.item.startTime.localeCompare(b.item.startTime))
			: [];
		const nextMoment = chosenItem
			? (dayItems.find(
					(e) =>
						e.item.id !== chosenItem.id &&
						e.item.status !== 'completed' &&
						e.item.startTime.localeCompare(chosenItem.startTime) > 0,
				) ?? null)
			: null;

		briefings.push({
			participantId: pid,
			label: participantLabel(participant),
			onStage,
			rolesHere,
			nextMoment,
			dayItems,
			assignments: buildAssignmentsData(pid, responsibilities, teams),
			documents: documents?.[pid] ?? null,
		});
	}

	briefings.sort((a, b) => a.label.localeCompare(b.label));
	return {
		onStage: briefings.filter((b) => b.onStage),
		others: briefings.filter((b) => !b.onStage),
	};
}
