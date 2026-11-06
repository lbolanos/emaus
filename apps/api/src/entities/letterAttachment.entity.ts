import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	ManyToOne,
	JoinColumn,
	Index,
} from 'typeorm';
import { Letter } from './letter.entity';

/**
 * Adjunto de una carta de familia (imagen o PDF) guardado tal cual en S3 privado
 * bajo `letters/` (specs/letters-email D6/D11). `isBrowserSafeImage` se precalcula
 * al ingest con magic bytes: solo jpeg/png/gif/webp se inlinean al imprimir.
 */
@Entity('letter_attachments')
@Index('IDX_letter_attachments_letter', ['letterId'])
export class LetterAttachment {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	letterId!: string;

	@ManyToOne(() => Letter, (letter) => letter.attachments, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'letterId' })
	letter!: Letter;

	@Column({ type: 'text' })
	fileName!: string;

	@Column({ type: 'varchar', length: 100 })
	mimeType!: string;

	@Column({ type: 'integer' })
	sizeBytes!: number;

	@Column({ type: 'boolean', default: false })
	isBrowserSafeImage!: boolean;

	// Key completo en S3 (prefijo letters/). La URL cruda nunca es pública.
	@Column({ type: 'text' })
	storageKey!: string;

	@Column({ type: 'text' })
	storageUrl!: string;

	@Column({ type: 'integer', default: 0 })
	sortOrder!: number;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;
}
