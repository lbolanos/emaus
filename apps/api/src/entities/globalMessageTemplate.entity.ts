import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';
import { GlobalMessageTemplate as IGlobalMessageTemplate } from '@repo/types';

export enum GlobalMessageTemplateType {
	WALKER_WELCOME = 'WALKER_WELCOME',
	SERVER_WELCOME = 'SERVER_WELCOME',
	EMERGENCY_CONTACT_VALIDATION = 'EMERGENCY_CONTACT_VALIDATION',
	PALANCA_REQUEST = 'PALANCA_REQUEST',
	PALANCA_REMINDER = 'PALANCA_REMINDER',
	GENERAL = 'GENERAL',
	PRE_RETREAT_REMINDER = 'PRE_RETREAT_REMINDER',
	PAYMENT_REMINDER = 'PAYMENT_REMINDER',
	POST_RETREAT_MESSAGE = 'POST_RETREAT_MESSAGE',
	CANCELLATION_CONFIRMATION = 'CANCELLATION_CONFIRMATION',
	USER_INVITATION = 'USER_INVITATION',
	PASSWORD_RESET = 'PASSWORD_RESET',
	RETREAT_SHARED_NOTIFICATION = 'RETREAT_SHARED_NOTIFICATION',
	BIRTHDAY_MESSAGE = 'BIRTHDAY_MESSAGE',
}

@Entity('global_message_templates')
export class GlobalMessageTemplate implements IGlobalMessageTemplate {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 255, unique: true })
	name!: string;

	@Column({
		type: 'varchar',
		enum: GlobalMessageTemplateType,
	})
	type!:
		| 'WALKER_WELCOME'
		| 'SERVER_WELCOME'
		| 'EMERGENCY_CONTACT_VALIDATION'
		| 'PALANCA_REQUEST'
		| 'PALANCA_REMINDER'
		| 'GENERAL'
		| 'PRE_RETREAT_REMINDER'
		| 'PAYMENT_REMINDER'
		| 'POST_RETREAT_MESSAGE'
		| 'CANCELLATION_CONFIRMATION'
		| 'USER_INVITATION'
		| 'PASSWORD_RESET'
		| 'RETREAT_SHARED_NOTIFICATION'
		| 'BIRTHDAY_MESSAGE';

	@Column({ type: 'text' })
	message!: string;

	@Column({ type: 'boolean', default: true })
	isActive!: boolean;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
