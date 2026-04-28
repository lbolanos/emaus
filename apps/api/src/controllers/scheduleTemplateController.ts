import { Request, Response } from 'express';
import { scheduleTemplateService } from '../services/scheduleTemplateService';

export const listTemplates = async (req: Request, res: Response) => {
	const setId = typeof req.query.setId === 'string' ? req.query.setId : undefined;
	const items = await scheduleTemplateService.listAll(setId);
	res.json(items);
};

// --- Sets ---

export const listTemplateSets = async (_req: Request, res: Response) => {
	const sets = await scheduleTemplateService.listSets();
	res.json(sets);
};

export const getTemplateSet = async (req: Request, res: Response) => {
	const s = await scheduleTemplateService.getSet(req.params.id);
	if (!s) return res.status(404).json({ message: 'Set not found' });
	res.json(s);
};

export const createTemplateSet = async (req: Request, res: Response) => {
	const s = await scheduleTemplateService.createSet(req.body);
	res.status(201).json(s);
};

export const updateTemplateSet = async (req: Request, res: Response) => {
	const s = await scheduleTemplateService.updateSet(req.params.id, req.body);
	if (!s) return res.status(404).json({ message: 'Set not found' });
	res.json(s);
};

export const deleteTemplateSet = async (req: Request, res: Response) => {
	const ok = await scheduleTemplateService.deleteSet(req.params.id);
	if (!ok) return res.status(404).json({ message: 'Set not found' });
	res.status(204).send();
};

export const getTemplate = async (req: Request, res: Response) => {
	const t = await scheduleTemplateService.get(req.params.id);
	if (!t) return res.status(404).json({ message: 'Template not found' });
	res.json(t);
};

export const createTemplate = async (req: Request, res: Response) => {
	const t = await scheduleTemplateService.create(req.body);
	res.status(201).json(t);
};

export const updateTemplate = async (req: Request, res: Response) => {
	const t = await scheduleTemplateService.update(req.params.id, req.body);
	if (!t) return res.status(404).json({ message: 'Template not found' });
	res.json(t);
};

export const deleteTemplate = async (req: Request, res: Response) => {
	const ok = await scheduleTemplateService.delete(req.params.id);
	if (!ok) return res.status(404).json({ message: 'Template not found' });
	res.status(204).send();
};
