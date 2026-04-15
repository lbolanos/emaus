import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('chat_conversations')
@Index(['userId'])
export class ChatConversation {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	userId!: string;

	@Column('varchar', { nullable: true })
	retreatId?: string | null;

	@Column('text')
	messages!: string;

	@Column('varchar', { length: 255, nullable: true })
	title?: string | null;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
