import { Request, Response, NextFunction } from 'express';
import * as serviceTeamService from '../services/serviceTeamService';

export const getTeamsForRetreat = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const teams = await serviceTeamService.findTeamsByRetreatId(retreatId);
		res.json(teams);
	} catch (error: any) {
		next(error);
	}
};

export const getTeam = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const team = await serviceTeamService.findTeamById(req.params.id);
		if (!team) {
			return res.status(404).json({ message: 'Service team not found' });
		}
		res.json(team);
	} catch (error: any) {
		next(error);
	}
};

export const createTeam = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const team = await serviceTeamService.createTeam(req.body);
		res.status(201).json(team);
	} catch (error: any) {
		next(error);
	}
};

export const updateTeam = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const team = await serviceTeamService.updateTeam(req.params.id, req.body);
		if (!team) {
			return res.status(404).json({ message: 'Service team not found' });
		}
		res.json(team);
	} catch (error: any) {
		next(error);
	}
};

export const deleteTeam = async (req: Request, res: Response, next: NextFunction) => {
	try {
		await serviceTeamService.deleteTeam(req.params.id);
		res.status(204).send();
	} catch (error: any) {
		next(error);
	}
};

export const addMember = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id } = req.params;
		const { participantId, role, sourceTeamId } = req.body;
		const team = await serviceTeamService.addMember(id, participantId, role, sourceTeamId);
		res.json(team);
	} catch (error: any) {
		next(error);
	}
};

export const removeMember = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id, participantId } = req.params;
		const team = await serviceTeamService.removeMember(id, participantId);
		res.json(team);
	} catch (error: any) {
		next(error);
	}
};

export const assignLeaderCtrl = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id } = req.params;
		const { participantId, sourceTeamId } = req.body;
		const team = await serviceTeamService.assignLeader(id, participantId, sourceTeamId);
		res.json(team);
	} catch (error: any) {
		next(error);
	}
};

export const unassignLeaderCtrl = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id } = req.params;
		const team = await serviceTeamService.unassignLeader(id);
		res.json(team);
	} catch (error: any) {
		next(error);
	}
};

export const initializeDefaults = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const existing = await serviceTeamService.findTeamsByRetreatId(retreatId);
		if (existing.length > 0) {
			return res.status(400).json({ message: 'Teams already exist for this retreat' });
		}
		await serviceTeamService.createDefaultServiceTeamsForRetreat({ id: retreatId } as any);
		const teams = await serviceTeamService.findTeamsByRetreatId(retreatId);
		res.status(201).json(teams);
	} catch (error: any) {
		next(error);
	}
};

export const exportTeamsDocx = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const buffer = await serviceTeamService.exportTeamsToDocx(retreatId);
		res.setHeader(
			'Content-Type',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		);
		res.setHeader('Content-Disposition', `attachment; filename=equipos-servicio-${retreatId}.docx`);
		res.send(buffer);
	} catch (error: any) {
		next(error);
	}
};
