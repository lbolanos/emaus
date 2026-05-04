import { Request, Response } from 'express';
import {
	listShirtTypes,
	createShirtType,
	updateShirtType,
	deleteShirtType,
} from '../services/shirtTypeService';

export const list = async (req: Request, res: Response) => {
	const items = await listShirtTypes(req.params.retreatId);
	res.json(items);
};

export const create = async (req: Request, res: Response) => {
	const item = await createShirtType(req.params.retreatId, req.body);
	res.status(201).json(item);
};

export const update = async (req: Request, res: Response) => {
	const item = await updateShirtType(req.params.id, req.body);
	if (!item) return res.status(404).json({ message: 'Shirt type not found' });
	res.json(item);
};

export const remove = async (req: Request, res: Response) => {
	const ok = await deleteShirtType(req.params.id);
	if (!ok) return res.status(404).json({ message: 'Shirt type not found' });
	res.status(204).send();
};
