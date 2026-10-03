import { Request, Response } from 'express';
import { getShirtOrdersForRetreat, setShirtOrderEstimate } from '../services/shirtReportService';

export const getShirtReport = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!retreatId) {
		return res.status(400).json({ message: 'retreatId is required' });
	}
	const report = await getShirtOrdersForRetreat(retreatId);
	res.json(report);
};

// Body already parsed by setShirtOrderEstimateSchema (validateRequest with
// assignParsedBody): only expectedWalkers/estimatedShirts reach here.
export const putShirtOrderEstimate = async (req: Request, res: Response) => {
	try {
		const { retreatId } = req.params;
		const { expectedWalkers, estimatedShirts } = req.body;
		const found = await setShirtOrderEstimate(retreatId, {
			expectedWalkers: expectedWalkers ?? null,
			estimatedShirts: estimatedShirts ?? {},
		});
		if (!found) return res.status(404).json({ message: 'Retreat not found' });
		res.json({ ok: true });
	} catch (error) {
		console.error('Error saving shirt order estimate:', error);
		res.status(500).json({ message: 'Error saving shirt order estimate' });
	}
};

export const deleteShirtOrderEstimate = async (req: Request, res: Response) => {
	try {
		const found = await setShirtOrderEstimate(req.params.retreatId, null);
		if (!found) return res.status(404).json({ message: 'Retreat not found' });
		res.json({ ok: true });
	} catch (error) {
		console.error('Error clearing shirt order estimate:', error);
		res.status(500).json({ message: 'Error clearing shirt order estimate' });
	}
};
