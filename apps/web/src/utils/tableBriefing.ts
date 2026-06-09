import type { Participant, TableMesa } from '@repo/types';
import type { TableData } from '@/utils/message';

/**
 * Construye el `TableData` (roster + teléfonos + contactos de emergencia) para el
 * briefing de una mesa. Enriquece cada caminante desde la lista completa de
 * participantes del retiro (el payload de mesas no trae los contactos de
 * emergencia); cae al objeto base si no se encuentra.
 *
 * Compartido por `TableCard` (botón por mesa) y `TablesView` (enviar a todos los
 * líderes), para no duplicar el mapeo.
 */
export function buildTableData(table: TableMesa, allParticipants: Participant[]): TableData {
	const enrich = (p: Participant): Participant =>
		allParticipants.find((x) => x.id === p.id) ?? p;
	const fullName = (p?: Participant | null): string =>
		p ? [p.firstName, p.lastName].filter(Boolean).join(' ').trim() : '';

	return {
		name: table.name,
		liderName: fullName(table.lider),
		colider1Name: fullName(table.colider1),
		colider2Name: fullName(table.colider2),
		walkers: (table.walkers || []).map((w) => {
			const e = enrich(w as Participant);
			return {
				firstName: e.firstName,
				lastName: e.lastName,
				nickname: e.nickname ?? undefined,
				cellPhone: e.cellPhone ?? undefined,
				homePhone: e.homePhone ?? undefined,
				workPhone: e.workPhone ?? undefined,
				emergencyContact1Name: e.emergencyContact1Name ?? undefined,
				emergencyContact1Relation: e.emergencyContact1Relation ?? undefined,
				emergencyContact1CellPhone: e.emergencyContact1CellPhone ?? undefined,
				emergencyContact1HomePhone: e.emergencyContact1HomePhone ?? undefined,
				emergencyContact1WorkPhone: e.emergencyContact1WorkPhone ?? undefined,
				emergencyContact2Name: e.emergencyContact2Name ?? undefined,
				emergencyContact2Relation: e.emergencyContact2Relation ?? undefined,
				emergencyContact2CellPhone: e.emergencyContact2CellPhone ?? undefined,
				emergencyContact2HomePhone: e.emergencyContact2HomePhone ?? undefined,
				emergencyContact2WorkPhone: e.emergencyContact2WorkPhone ?? undefined,
			};
		}),
	};
}
