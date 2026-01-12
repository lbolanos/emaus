import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { MessageTemplate as IMessageTemplate, messageTemplateTypes } from '@repo/types';
import { Retreat } from './retreat.entity';
import { Community } from './community.entity';

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
		| 'BIRTHDAY_MESSAGE'
		// System templates (should not be used in retreat-specific templates)
		| 'SYS_PASSWORD_RESET'
		| 'SYS_USER_INVITATION'
		| 'SYS_REGISTRATION_CONFIRMATION'
		| 'SYS_EMAIL_VERIFICATION'
		| 'SYS_ACCOUNT_LOCKED'
		| 'SYS_ACCOUNT_UNLOCKED'
		| 'SYS_ROLE_REQUESTED'
		| 'SYS_ROLE_APPROVED'
		| 'SYS_ROLE_REJECTED';

	@Column({
		type: 'varchar',
		enum: ['retreat', 'community'],
		default: 'retreat',
	})
	scope!: 'retreat' | 'community';

	@Column({ type: 'text' })
	message!: string;

	@Column({ type: 'uuid', nullable: true })
	retreatId?: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'uuid', nullable: true })
	communityId?: string;

	@ManyToOne(() => Community, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'communityId' })
	community?: Community;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
