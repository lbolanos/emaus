import { Request, Response } from 'express';
import { getShirtOrdersForRetreat } from '../services/shirtReportService';

export const getShirtReport = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!retreatId) {
		return res.status(400).json({ message: 'retreatId is required' });
	}
	const report = await getShirtOrdersForRetreat(retreatId);
	res.json(report);
};
