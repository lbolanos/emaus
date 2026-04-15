import { Request, Response, NextFunction } from 'express';
import { createChatStream, isConfigured } from '../services/aiChatService';
import { AppDataSource } from '../data-source';
import { ChatConversation } from '../entities/chatConversation.entity';

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

export const saveConversation = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const userId = (req as any).user?.id;
		const { id, messages, retreatId, title } = req.body;
		if (!messages?.length) {
			return res.status(400).json({ message: 'Messages required' });
		}

		const repo = AppDataSource.getRepository(ChatConversation);

		if (id) {
			const existing = await repo.findOne({ where: { id, userId } });
			if (!existing) {
				return res.status(404).json({ message: 'Conversation not found' });
			}
			existing.messages = JSON.stringify(messages);
			existing.retreatId = retreatId ?? null;
			existing.title = title ?? existing.title;
			await repo.save(existing);
			return res.json({ id: existing.id });
		}

		const conversation = repo.create({
			userId,
			messages: JSON.stringify(messages),
			retreatId: retreatId ?? null,
			title: title ?? null,
		});
		await repo.save(conversation);
		res.json({ id: conversation.id });
	} catch (error) {
		next(error);
	}
};

export const getConversations = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const userId = (req as any).user?.id;
		const repo = AppDataSource.getRepository(ChatConversation);
		const conversations = await repo.find({
			where: { userId },
			select: ['id', 'title', 'retreatId', 'createdAt', 'updatedAt'],
			order: { updatedAt: 'DESC' },
			take: 50,
		});
		res.json(conversations);
	} catch (error) {
		next(error);
	}
};

export const getConversation = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const userId = (req as any).user?.id;
		const repo = AppDataSource.getRepository(ChatConversation);
		const conversation = await repo.findOne({ where: { id: req.params.id, userId } });
		if (!conversation) {
			return res.status(404).json({ message: 'Conversation not found' });
		}
		res.json({
			...conversation,
			messages: JSON.parse(conversation.messages),
		});
	} catch (error) {
		next(error);
	}
};

export const deleteConversation = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const userId = (req as any).user?.id;
		const repo = AppDataSource.getRepository(ChatConversation);
		const result = await repo.delete({ id: req.params.id, userId });
		if (result.affected === 0) {
			return res.status(404).json({ message: 'Conversation not found' });
		}
		res.json({ success: true });
	} catch (error) {
		next(error);
	}
};
