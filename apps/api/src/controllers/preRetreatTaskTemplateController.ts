import { Request, Response } from 'express';
import { preRetreatTaskTemplateService } from '../services/preRetreatTaskTemplateService';

const mapError = (res: Response, err: unknown) => {
	const msg = err instanceof Error ? err.message : 'Unexpected error';
	// Errores de validación de jerarquía/padre → 400 (mensaje en español del servicio)
	return res.status(400).json({ message: msg });
};

// --- Sets ---

export const listTemplateSets = async (_req: Request, res: Response) => {
	res.json(await preRetreatTaskTemplateService.listSets());
};

export const getTemplateSet = async (req: Request, res: Response) => {
	const s = await preRetreatTaskTemplateService.getSet(req.params.id);
	if (!s) return res.status(404).json({ message: 'Set not found' });
	res.json(s);
};

export const createTemplateSet = async (req: Request, res: Response) => {
	const s = await preRetreatTaskTemplateService.createSet(req.body);
	res.status(201).json(s);
};

export const updateTemplateSet = async (req: Request, res: Response) => {
	const s = await preRetreatTaskTemplateService.updateSet(req.params.id, req.body);
	if (!s) return res.status(404).json({ message: 'Set not found' });
	res.json(s);
};

export const deleteTemplateSet = async (req: Request, res: Response) => {
	const ok = await preRetreatTaskTemplateService.deleteSet(req.params.id);
	if (!ok) return res.status(404).json({ message: 'Set not found' });
	res.status(204).send();
};

// --- Items ---

export const listTemplates = async (req: Request, res: Response) => {
	const setId = typeof req.query.setId === 'string' ? req.query.setId : undefined;
	res.json(await preRetreatTaskTemplateService.listAll(setId));
};

export const getTemplate = async (req: Request, res: Response) => {
	const t = await preRetreatTaskTemplateService.get(req.params.id);
	if (!t) return res.status(404).json({ message: 'Template not found' });
	res.json(t);
};

export const createTemplate = async (req: Request, res: Response) => {
	try {
		const t = await preRetreatTaskTemplateService.create(req.body);
		res.status(201).json(t);
	} catch (err) {
		mapError(res, err);
	}
};

export const updateTemplate = async (req: Request, res: Response) => {
	try {
		const t = await preRetreatTaskTemplateService.update(req.params.id, req.body);
		if (!t) return res.status(404).json({ message: 'Template not found' });
		res.json(t);
	} catch (err) {
		mapError(res, err);
	}
};

export const deleteTemplate = async (req: Request, res: Response) => {
	const ok = await preRetreatTaskTemplateService.delete(req.params.id);
	if (!ok) return res.status(404).json({ message: 'Template not found' });
	res.status(204).send();
};
