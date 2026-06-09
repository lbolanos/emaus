import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	ManyToOne,
	JoinColumn,
	Index,
} from 'typeorm';
import { Retreat } from './retreat.entity';

@Entity('retreat_memory_photo')
@Index('idx_retreat_memory_photo_retreatId', ['retreatId'])
export class RetreatMemoryPhoto {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, (retreat) => retreat.memoryPhotos, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	// Public URL (S3 https URL) or a base64 data URI when storage is disk/base64.
	@Column({ type: 'varchar' })
	url!: string;

	// S3 object key, so the file can be deleted individually from the bucket.
	// Null when the photo is stored as a base64 data URI (no S3 object).
	@Column({ type: 'varchar', nullable: true })
	s3Key?: string | null;

	@Column({ type: 'boolean', default: false })
	isPrimary!: boolean;

	@Column({ type: 'integer', default: 0 })
	sortOrder!: number;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;
}
