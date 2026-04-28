import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	Index,
} from 'typeorm';

/**
 * Documento (archivo o markdown) vinculado a una Responsabilidad por nombre
 * canónico. Es global: una sola fuente para todos los retiros y templates
 * que compartan el mismo `responsabilityName` (ej. 'Charla: De la Rosa').
 */
@Entity('responsability_attachment')
@Index('IDX_ra_responsability_name', ['responsabilityName'])
export class ResponsabilityAttachment {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	responsabilityName!: string;

	@Column('varchar', { default: 'file' })
	kind!: 'file' | 'markdown';

	@Column('varchar')
	fileName!: string;

	@Column('varchar')
	mimeType!: string;

	@Column('integer')
	sizeBytes!: number;

	@Column('text')
	storageUrl!: string;

	@Column('text', { nullable: true })
	storageKey?: string | null;

	@Column('text', { nullable: true })
	content?: string | null;

	@Column('text', { nullable: true })
	description?: string | null;

	@Column('integer', { default: 0 })
	sortOrder!: number;

	@Column({ type: 'uuid', nullable: true })
	uploadedById?: string | null;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
