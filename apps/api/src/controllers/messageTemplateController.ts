import { Request, Response } from 'express';
import { MessageTemplateService } from '../services/messageTemplateService';

const messageTemplateService = new MessageTemplateService();

export const getMessageTemplates = async (req: Request, res: Response) => {
  const templates = await messageTemplateService.findAll();
  res.json(templates);
};

export const getMessageTemplateById = async (req: Request, res: Response) => {
  const template = await messageTemplateService.findById(req.params.id);
  if (!template) {
    return res.status(404).json({ message: 'Template not found' });
  }
  res.json(template);
};

export const createMessageTemplate = async (req: Request, res: Response) => {
  const newTemplate = await messageTemplateService.create(req.body);
  res.status(201).json(newTemplate);
};

export const updateMessageTemplate = async (req: Request, res: Response) => {
  const updatedTemplate = await messageTemplateService.update(req.params.id, req.body);
  if (!updatedTemplate) {
    return res.status(404).json({ message: 'Template not found' });
  }
  res.json(updatedTemplate);
};

export const deleteMessageTemplate = async (req: Request, res: Response) => {
  const success = await messageTemplateService.remove(req.params.id);
  if (!success) {
    return res.status(404).json({ message: 'Template not found' });
  }
  res.status(204).send();
};
