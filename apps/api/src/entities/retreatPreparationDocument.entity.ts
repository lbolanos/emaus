import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	Index,
} from 'typeorm';
import { RetreatPreparation } from './retreatPreparation.entity';

export type PreparationDocumentKind = 'file' | 'markdown';

/**
 * Documento adjunto a una preparación semanal (mismo modelo dual que los
 * docs de responsabilidades):
 * - kind 'file': archivo subido a S3 bajo `public-assets/preparations/…`
 *   (URL pública directa — el calendario y sus archivos son públicos por
 *   diseño). Fallback inline data-url si no hay S3.
 * - kind 'markdown': texto editable in-app; `content` guarda el markdown.
 */
@Entity('retreat_preparation_document')
@Index('IDX_retreat_preparation_document_prep', ['preparationId'])
export class RetreatPreparationDocument {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	preparationId!: string;

	@ManyToOne(() => RetreatPreparation, (p) => p.documents, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'preparationId' })
	preparation?: RetreatPreparation;

	@Column('varchar', { default: 'file' })
	kind!: PreparationDocumentKind;

	@Column('text', { nullable: true })
	content?: string | null;

	@Column('varchar')
	fileName!: string;

	@Column('varchar')
	mimeType!: string;

	@Column({ type: 'integer', default: 0 })
	sizeBytes!: number;

	@Column('text')
	url!: string;

	@Column('varchar', { nullable: true })
	storageKey?: string | null;

	@Column({ type: 'integer', default: 0 })
	sortOrder!: number;

	@CreateDateColumn()
	createdAt!: Date;
}
