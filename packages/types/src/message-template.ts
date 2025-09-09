import { z } from 'zod';

export const messageTemplateTypes = z.enum([
  'WALKER_WELCOME',
  'SERVER_WELCOME',
  'EMERGENCY_CONTACT_VALIDATION',
  'PALANCA_REQUEST',
  'PALANCA_REMINDER',
  'GENERAL',
]);

export const MessageTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  type: messageTemplateTypes,
  message: z.string().min(1, 'Message is required'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateMessageTemplateSchema = z.object({
  body: MessageTemplateSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  }),
});

export const UpdateMessageTemplateSchema = z.object({
  body: CreateMessageTemplateSchema.shape.body.partial(),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export type MessageTemplate = z.infer<typeof MessageTemplateSchema>;
export type CreateMessageTemplate = z.infer<typeof CreateMessageTemplateSchema>;
export type UpdateMessageTemplate = z.infer<typeof UpdateMessageTemplateSchema>;
