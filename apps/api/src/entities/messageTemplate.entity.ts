import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { MessageTemplate as IMessageTemplate, messageTemplateTypes } from '@repo/types';

@Entity('message_templates')
export class MessageTemplate implements IMessageTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    type: 'varchar',
    enum: messageTemplateTypes.options,
  })
  type!: 'WALKER_WELCOME' | 'SERVER_WELCOME' | 'EMERGENCY_CONTACT_VALIDATION' | 'PALANCA_REQUEST' | 'PALANCA_REMINDER' | 'GENERAL';

  @Column({ type: 'text' })
  message!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
