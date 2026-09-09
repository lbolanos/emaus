import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
	Index,
} from 'typeorm';
import { Participant } from './participant.entity';
import { Retreat } from './retreat.entity';
import { Community } from './community.entity';
import { User } from './user.entity';

/**
 * Entrada del hilo de seguimiento de una persona: una nota escrita por el
 * coordinador, o un evento del sistema (cambio de etapa, hito alcanzado).
 *
 * A diferencia de `ParticipantFollowUp.note` — que es un único campo que se
 * sobrescribe — esto es append-only y guarda autor y fecha, así que responde
 * "quién dijo qué y cuándo".
 *
 *  - note         : escrita por una persona. Editable/borrable sólo por su autor.
 *  - stage_change : escrita por el sistema. Inmutable.
 *
 * El par `scope`/`retreatId`/`communityId` espeja `ParticipantCommunication`
 * para que el hilo sirva igual a un miembro de comunidad más adelante; hoy
 * sólo se escribe con scope 'retreat'.
 */
export type ParticipantNoteKind = 'note' | 'stage_change';

/** Contenido de `metadata` cuando `kind = 'stage_change'`. */
export interface ParticipantNoteMetadata {
	/** Cambio de etapa del pipeline. */
	from?: string;
	to?: string;
	/** true si el cambio de etapa también escribió `attendanceConfirmation`. */
	attendanceSynced?: boolean;
	/** Hito alcanzado (hoy sólo 'palancas'). */
	milestone?: 'palancas';
	count?: number;
	threshold?: number;
}

@Entity('participant_notes')
@Index('IDX_participant_notes_thread', ['participantId', 'retreatId', 'createdAt'])
// El hito de cartas es único por persona y retiro; la comprobación en el
// servicio no cierra la carrera de dos guardados simultáneos, el índice sí.
// Declarado aquí Y en la migración: la DB de test la crea `synchronize` desde
// las entidades, así que sin esto el test correría sin la restricción que
// protege a producción.
@Index('UQ_participant_notes_palanca_milestone', ['participantId', 'retreatId'], {
	unique: true,
	where: `json_extract("metadata", '$.milestone') = 'palancas'`,
})
export class ParticipantNote {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	participantId!: string;

	@ManyToOne(() => Participant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant?: Participant;

	@Column({ type: 'varchar', length: 20 })
	scope!: 'retreat' | 'community';

	@Column({ type: 'uuid', nullable: true })
	retreatId?: string | null;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'uuid', nullable: true })
	communityId?: string | null;

	@ManyToOne(() => Community, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'communityId' })
	community?: Community;

	@Column({ type: 'varchar', length: 20, default: 'note' })
	kind!: ParticipantNoteKind;

	/** Texto de la nota. Null en las entradas del sistema. */
	@Column({ type: 'text', nullable: true })
	body?: string | null;

	@Column({ type: 'simple-json', nullable: true })
	metadata?: ParticipantNoteMetadata | null;

	@Column({ type: 'uuid', nullable: true })
	createdBy?: string | null;

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'createdBy' })
	author?: User;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
