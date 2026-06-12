import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
	Unique,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { Participant } from './participant.entity';
import { User } from './user.entity';

/**
 * Estado de seguimiento de un participante en un retiro (pipeline CRM).
 * Generaliza el patrón de `CommunityMember.state`: es un marcador de gestión
 * del coordinador, NO un permiso.
 *  - pending   : por contactar
 *  - contacted : ya se le contactó, esperando respuesta
 *  - confirmed : confirmó (asistencia / pago / lo que aplique)
 *  - no_answer : sin respuesta tras contactarlo
 *  - declined  : declinó / no asistirá
 */
export type FollowUpStatus = 'pending' | 'contacted' | 'confirmed' | 'no_answer' | 'declined';

@Entity('participant_followups')
@Unique('UQ_followup_participant_retreat', ['participantId', 'retreatId'])
export class ParticipantFollowUp {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'uuid' })
	participantId!: string;

	@ManyToOne(() => Participant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant?: Participant;

	@Column({ type: 'varchar', length: 20, default: 'pending' })
	status!: FollowUpStatus;

	@Column({ type: 'text', nullable: true })
	note?: string | null;

	@Column({ type: 'uuid', nullable: true })
	updatedBy?: string | null;

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'updatedBy' })
	updater?: User;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
