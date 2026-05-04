import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Snapshot de una versión anterior de un attachment markdown. Se inserta una
 * fila ANTES de cada `updateMarkdown` para que el coordinador pueda restaurar
 * si edita por error.
 *
 * No se versionan archivos binarios (kind='file') — su contenido vive en
 * S3/dataUrl inmutable.
 */
@Entity('responsability_attachment_history')
@Index('IDX_rah_attachment', ['attachmentId'])
@Index('IDX_rah_attachment_savedAt', ['attachmentId', 'savedAt'])
export class ResponsabilityAttachmentHistory {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	attachmentId!: string;

	@Column('varchar')
	title!: string;

	@Column('text')
	content!: string;

	@Column('text', { nullable: true })
	description?: string | null;

	@Column('integer')
	sizeBytes!: number;

	@CreateDateColumn({ name: 'savedAt' })
	savedAt!: Date;

	@Column('varchar', { nullable: true })
	savedById?: string | null;
}
