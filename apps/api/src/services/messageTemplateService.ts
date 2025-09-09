import { AppDataSource } from '../data-source';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { CreateMessageTemplate, UpdateMessageTemplate } from '@repo/types';

export class MessageTemplateService {
  private messageTemplateRepository = AppDataSource.getRepository(MessageTemplate);

  async findAll(): Promise<MessageTemplate[]> {
    return this.messageTemplateRepository.find();
  }

  async findById(id: string): Promise<MessageTemplate | null> {
    return this.messageTemplateRepository.findOneBy({ id });
  }

  async create(data: CreateMessageTemplate['body']): Promise<MessageTemplate> {
    const newMessageTemplate = this.messageTemplateRepository.create(data);
    return this.messageTemplateRepository.save(newMessageTemplate);
  }

  async update(id: string, data: UpdateMessageTemplate['body']): Promise<MessageTemplate | null> {
    const result = await this.messageTemplateRepository.update(id, data);
    if (result.affected === null || result.affected === undefined || result.affected === 0) {
      return null;
    }
    return this.findById(id);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.messageTemplateRepository.delete(id);
    return result.affected !== null && result.affected !== undefined && result.affected > 0;
  }
}
