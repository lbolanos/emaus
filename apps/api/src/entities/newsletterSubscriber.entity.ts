import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('newsletter_subscribers')
export class NewsletterSubscriber {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ type: 'varchar', unique: true })
	email: string;

	@Column({ type: 'varchar', nullable: true })
	firstName?: string;

	@Column({ type: 'varchar', nullable: true })
	lastName?: string;

	@Column({ type: 'boolean', default: true })
	isActive: boolean;

	@CreateDateColumn()
	subscribedAt: Date;
}
