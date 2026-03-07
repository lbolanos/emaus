import { Request, Response, NextFunction } from 'express';
import { createChatStream, isConfigured } from '../services/aiChatService';

export const streamChat = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { messages, retreatId } = req.body;
		if (!messages?.length) {
			return res.status(400).json({ message: 'Messages required' });
		}
		if (!isConfigured()) {
			return res.status(503).json({ message: 'AI not configured' });
		}

		const userId = (req as any).user?.id;
		const result = await createChatStream(messages, userId, retreatId);

		result.pipeUIMessageStreamToResponse(res);
	} catch (error) {
		if (res.headersSent) {
			res.end();
		} else {
			next(error);
		}
	}
};

export const chatStatus = async (_req: Request, res: Response) => {
	res.json({ configured: isConfigured() });
};
