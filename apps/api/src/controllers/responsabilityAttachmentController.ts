import { Request, Response } from 'express';
import {
	responsabilityAttachmentService,
	AttachmentNotFoundError,
	AttachmentValidationError,
} from '../services/responsabilityAttachmentService';

const mapError = (res: Response, err: unknown) => {
	if (err instanceof AttachmentNotFoundError) {
		return res.status(404).json({ message: err.message });
	}
	if (err instanceof AttachmentValidationError) {
		return res.status(400).json({ message: err.message });
	}
	const msg = err instanceof Error ? err.message : 'Unexpected error';
	return res.status(500).json({ message: msg });
};

const decodeName = (raw: string): string => {
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
};

export const listAttachments = async (req: Request, res: Response) => {
	try {
		const items = await responsabilityAttachmentService.list(decodeName(req.params.name));
		res.json(items);
	} catch (err) {
		mapError(res, err);
	}
};

export const createAttachment = async (req: Request, res: Response) => {
	try {
		const userId = (req.user as any)?.id ?? null;
		const { dataUrl, fileName, mimeType, description } = req.body ?? {};
		if (!dataUrl || !fileName || !mimeType) {
			return res
				.status(400)
				.json({ message: 'dataUrl, fileName y mimeType son requeridos' });
		}
		const att = await responsabilityAttachmentService.upload(
			decodeName(req.params.name),
			{ dataUrl, fileName, mimeType, description },
			userId,
		);
		res.status(201).json(att);
	} catch (err) {
		mapError(res, err);
	}
};

export const updateAttachment = async (req: Request, res: Response) => {
	try {
		const att = await responsabilityAttachmentService.update(
			req.params.attachmentId,
			req.body ?? {},
		);
		res.json(att);
	} catch (err) {
		mapError(res, err);
	}
};

export const deleteAttachment = async (req: Request, res: Response) => {
	try {
		await responsabilityAttachmentService.delete(req.params.attachmentId);
		res.status(204).send();
	} catch (err) {
		mapError(res, err);
	}
};

export const createMarkdownAttachment = async (req: Request, res: Response) => {
	try {
		const userId = (req.user as any)?.id ?? null;
		const { title, content, description } = req.body ?? {};
		if (typeof title !== 'string' || typeof content !== 'string') {
			return res.status(400).json({ message: 'title y content son requeridos' });
		}
		const att = await responsabilityAttachmentService.createMarkdown(
			decodeName(req.params.name),
			{ title, content, description },
			userId,
		);
		res.status(201).json(att);
	} catch (err) {
		mapError(res, err);
	}
};

export const updateMarkdownAttachment = async (req: Request, res: Response) => {
	try {
		const att = await responsabilityAttachmentService.updateMarkdown(
			req.params.attachmentId,
			req.body ?? {},
		);
		res.json(att);
	} catch (err) {
		mapError(res, err);
	}
};
