import { Request, Response, NextFunction } from 'express';
import * as tableMesaService from '../services/tableMesaService';
import { domainAuditService, DomainAuditAction } from '../services/domainAuditService';
import { canViewHealthData, stripSensitiveHealthFields } from './participantController';

/**
 * Strip health/emergency-contact data from every Participant a table payload
 * embeds — lider/colider1/colider2 are nested single objects (stripped one by
 * one: stripSensitiveHealthFields recurses arrays but not nested objects) and
 * walkers is an array of flattened participants (the recursive strip covers
 * it). Same `participant:health` gate as the /participants endpoints: the
 * table JSON views served the full ficha to any role with table access.
 */
const tablesWithoutHealth = <T>(payload: T): T => {
	const stripTable = (table: any): any => {
		if (!table || typeof table !== 'object') return table;
		const stripped: any = { ...table };
		for (const slot of ['lider', 'colider1', 'colider2']) {
			if (stripped[slot]) {
				stripped[slot] = stripSensitiveHealthFields(stripped[slot]);
			}
		}
		if (Array.isArray(stripped.walkers)) {
			stripped.walkers = stripSensitiveHealthFields(stripped.walkers);
		}
		return stripped;
	};
	return (Array.isArray(payload) ? payload.map(stripTable) : stripTable(payload)) as T;
};

export const getTablesForRetreat = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const tables = await tableMesaService.findTablesByRetreatId(retreatId);
		const canSeeHealth = await canViewHealthData(req);
		if (canSeeHealth) {
			void domainAuditService.log({
				action: DomainAuditAction.PARTICIPANT_HEALTH_VIEW,
				resourceType: 'participant',
				retreatId,
				metadata: { endpoint: 'table-list', count: tables.length },
			});
		}
		res.json(canSeeHealth ? tables : tablesWithoutHealth(tables));
	} catch (error: any) {
		next(error);
	}
};

export const rebalanceTables = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		await tableMesaService.rebalanceTablesForRetreat(retreatId);
		res.status(200).json({ message: 'Tables rebalanced successfully' });
	} catch (error: any) {
		next(error);
	}
};

export const getTable = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const table = await tableMesaService.findTableById(req.params.id);
		if (!table) {
			return res.status(404).json({ message: 'Table not found' });
		}
		const canSeeHealth = await canViewHealthData(req);
		res.json(canSeeHealth ? table : tablesWithoutHealth(table));
	} catch (error: any) {
		next(error);
	}
};

export const createTable = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const newTable = await tableMesaService.createTable(req.body);
		res.status(201).json(newTable);
	} catch (error: any) {
		next(error);
	}
};

export const updateTable = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const updatedTable = await tableMesaService.updateTable(req.params.id, req.body);
		if (!updatedTable) {
			return res.status(404).json({ message: 'Table not found' });
		}
		res.json(updatedTable);
	} catch (error: any) {
		next(error);
	}
};

export const deleteTable = async (req: Request, res: Response, next: NextFunction) => {
	try {
		await tableMesaService.deleteTable(req.params.id);
		res.status(204).send();
	} catch (error: any) {
		next(error);
	}
};

export const assignLeader = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id: tableId, role } = req.params;
		const { participantId } = req.body;

		// Validate tableId is a valid UUID
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tableId)
		) {
			return res.status(400).json({ message: 'Invalid table ID' });
		}

		const updatedTable = await tableMesaService.assignLeaderToTable(
			tableId,
			participantId,
			role as any,
		);
		// Mutations already audit their own action; the health gate here only
		// shapes the response payload.
		const canSeeHealth = await canViewHealthData(req);
		res.json(canSeeHealth ? updatedTable : tablesWithoutHealth(updatedTable));
	} catch (error) {
		next(error);
	}
};

export const unassignLeader = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id: tableId, role } = req.params;
		console.log(`Attempting to unassign leader from tableId: ${tableId}, role: ${role}`);

		// Validate tableId is a valid UUID
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tableId)
		) {
			return res.status(400).json({ message: 'Invalid table ID' });
		}

		const updatedTable = await tableMesaService.unassignLeaderFromTable(tableId, role as any);
		const canSeeHealth = await canViewHealthData(req);
		res.json(canSeeHealth ? updatedTable : tablesWithoutHealth(updatedTable));
	} catch (error) {
		next(error);
	}
};

export const assignWalker = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id: tableId } = req.params;
		const { participantId } = req.body;

		// Validate tableId is a valid UUID
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tableId)
		) {
			return res.status(400).json({ message: 'Invalid table ID' });
		}

		const updatedTable = await tableMesaService.assignWalkerToTable(tableId, participantId);
		const canSeeHealth = await canViewHealthData(req);
		res.json(canSeeHealth ? updatedTable : tablesWithoutHealth(updatedTable));
	} catch (error) {
		next(error);
	}
};

export const unassignWalker = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id: tableId, walkerId } = req.params;
		console.log(`Attempting to unassign walkerId: ${walkerId} from tableId: ${tableId}`);

		// Validate tableId is a valid UUID
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tableId)
		) {
			return res.status(400).json({ message: 'Invalid table ID' });
		}

		const updatedTable = await tableMesaService.unassignWalkerFromTable(tableId, walkerId);
		const canSeeHealth = await canViewHealthData(req);
		res.json(canSeeHealth ? updatedTable : tablesWithoutHealth(updatedTable));
	} catch (error) {
		next(error);
	}
};

export const clearAllTables = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		await tableMesaService.clearAllTablesForRetreat(retreatId);
		res.status(200).json({ message: 'All tables cleared successfully' });
	} catch (error: any) {
		next(error);
	}
};

export const deleteEmptyTables = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const result = await tableMesaService.deleteEmptyTablesForRetreat(retreatId);
		res.status(200).json(result);
	} catch (error: any) {
		next(error);
	}
};

export const exportTablesToDocx = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;

		// Validate retreatId is a valid UUID
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(retreatId)
		) {
			return res.status(400).json({ message: 'Invalid retreat ID' });
		}

		const buffer = await tableMesaService.exportTablesToDocx(retreatId);

		// Set headers for file download
		res.setHeader(
			'Content-Type',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		);
		res.setHeader('Content-Disposition', `attachment; filename="mesas-retiro-${retreatId}.docx"`);
		res.setHeader('Content-Length', buffer.length);

		// Send the file
		res.send(buffer);
	} catch (error: any) {
		console.error('Error exporting tables to DOCX:', error);
		next(error);
	}
};
