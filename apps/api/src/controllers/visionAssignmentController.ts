import { Request, Response, NextFunction } from 'express';
import { analyzeLotteryPhoto, executeAssignments, analyzeTablePhoto } from '../services/visionAssignmentService';

export const analyze = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { imageBase64, contentType, retreatId } = req.body;

		if (!imageBase64 || !contentType || !retreatId) {
			return res.status(400).json({ message: 'imageBase64, contentType y retreatId son requeridos' });
		}

		// Validate base64 size (~10MB max after decoding)
		const estimatedSize = (imageBase64.length * 3) / 4;
		if (estimatedSize > 10 * 1024 * 1024) {
			return res.status(400).json({ message: 'La imagen es demasiado grande. Máximo 10MB.' });
		}

		const result = await analyzeLotteryPhoto(imageBase64, contentType, retreatId);
		res.json(result);
	} catch (error: any) {
		if (!res.headersSent) {
			next(error);
		}
	}
};

export const analyzeTable = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { imageBase64, contentType, retreatId, tableId } = req.body;

		if (!imageBase64 || !contentType || !retreatId || !tableId) {
			return res.status(400).json({ message: 'imageBase64, contentType, retreatId y tableId son requeridos' });
		}

		const estimatedSize = (imageBase64.length * 3) / 4;
		if (estimatedSize > 10 * 1024 * 1024) {
			return res.status(400).json({ message: 'La imagen es demasiado grande. Máximo 10MB.' });
		}

		const result = await analyzeTablePhoto(imageBase64, contentType, retreatId, tableId);
		res.json(result);
	} catch (error: any) {
		if (!res.headersSent) {
			next(error);
		}
	}
};

export const execute = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId, assignments } = req.body;

		if (!retreatId || !assignments?.length) {
			return res.status(400).json({ message: 'retreatId y assignments son requeridos' });
		}

		const results = await executeAssignments(retreatId, assignments);
		res.json({ results });
	} catch (error: any) {
		if (!res.headersSent) {
			next(error);
		}
	}
};
