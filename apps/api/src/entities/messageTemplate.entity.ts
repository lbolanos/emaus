import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MessageTemplate as IMessageTemplate, messageTemplateTypes } from '@repo/types';
import { Retreat } from './retreat.entity';

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
  type!: 'WALKER_WELCOME' | 'SERVER_WELCOME' | 'EMERGENCY_CONTACT_VALIDATION' | 'PALANCA_REQUEST' | 'PALANCA_REMINDER' | 'GENERAL' | 'PRE_RETREAT_REMINDER' | 'PAYMENT_REMINDER' | 'POST_RETREAT_MESSAGE' | 'CANCELLATION_CONFIRMATION';

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'uuid' })
  retreatId!: string;

  @ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'retreatId' })
  retreat!: Retreat;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
