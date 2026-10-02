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
	// Tipado derivado del enum runtime: la unión manual de antes quedaba
	// desactualizada al añadir un tipo (SERVER_SHIRT_CONFIRMATION faltaba) y
	// obligaba a `as any` en los find por tipo.
	type!: (typeof messageTemplateTypes)['options'][number];

	@Column({
		type: 'varchar',
		enum: ['retreat', 'community'],
		default: 'retreat',
	})
	scope!: 'retreat' | 'community';

	@Column({ type: 'text' })
	message!: string;

	// M6: the template chosen for its type wherever the system picks by type
	// (quick-send buttons, unpinned or newly seeded sequence steps). At most one
	// per (retreat, type), kept by messageTemplateService; none → the oldest.
	@Column({ type: 'boolean', default: false })
	isDefault!: boolean;

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
