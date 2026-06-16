import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	OneToMany,
} from 'typeorm';
import type { SequenceTrigger, SequenceAudience } from './messageSequence.entity';
import { GlobalSequenceStep } from './globalSequenceStep.entity';

/**
 * Plantilla GLOBAL de una secuencia de mensajes (drip), reutilizable en
 * cualquier retiro. A diferencia de `MessageSequence`, NO está ligada a un
 * retiro ni usa `segmentId` (los segmentos son por-retiro). Se importa a un
 * retiro vía `globalMessageSequenceService.copyToRetreat`, que crea una
 * `MessageSequence` clon (inactiva) en ese retiro.
 *
 * Espeja el patrón de `GlobalMessageTemplate`.
 */
@Entity('global_message_sequences')
export class GlobalMessageSequence {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 150, unique: true })
	name!: string;

	@Column({ type: 'text', nullable: true })
	description?: string | null;

	@Column({ type: 'varchar', length: 30 })
	trigger!: SequenceTrigger;

	@Column({ type: 'varchar', length: 20, default: 'all' })
	audience!: SequenceAudience;

	@Column({ type: 'boolean', default: true })
	isActive!: boolean;

	// Se copia al importar a un retiro (ver MessageSequence).
	@Column({ type: 'integer', nullable: true })
	maxOverdueDays?: number | null;

	@OneToMany(() => GlobalSequenceStep, (step) => step.sequence)
	steps?: GlobalSequenceStep[];

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
