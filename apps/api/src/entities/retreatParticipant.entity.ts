import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Participant } from './participant.entity';
import { Retreat } from './retreat.entity';
import { TableMesa } from './tableMesa.entity';

@Entity('retreat_participants')
export class RetreatParticipant {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid', nullable: true })
	userId?: string | null;

	@ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'userId' })
	user?: User | null;

	@Column({ type: 'uuid', nullable: true })
	participantId?: string | null;

	@ManyToOne(() => Participant, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'participantId' })
	participant?: Participant | null;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, (retreat) => retreat.retreatParticipants, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@Column({ type: 'varchar' })
	roleInRetreat!: string;

	@Column({ type: 'boolean', default: false })
	isPrimaryRetreat!: boolean; // Marks if this is their "main" retreat

	@Column({ type: 'text', nullable: true })
	notes?: string;

	@Column({ type: 'json', nullable: true })
	metadata?: Record<string, any>; // Flexible storage for additional data

	@CreateDateColumn()
	createdAt!: Date;

	// ---- Retreat-specific snapshot fields ----

	@Column({ type: 'varchar', nullable: true })
	type?: string | null;

	@Column({ type: 'boolean', default: false })
	isCancelled!: boolean;

	@Column({ type: 'uuid', nullable: true })
	tableId?: string | null;

	@ManyToOne(() => TableMesa, (table) => table.walkers, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'tableId' })
	tableMesa?: TableMesa | null;

	@Column({ type: 'integer', nullable: true })
	idOnRetreat?: number | null;

	@Column({ type: 'varchar', length: 20, nullable: true })
	familyFriendColor?: string | null;

	@Column({ type: 'boolean', default: false })
	checkedIn!: boolean;

	@Column({ type: 'datetime', nullable: true })
	checkedInAt?: Date | null;

	@Column({ type: 'boolean', default: false })
	bagMade!: boolean;

	@Column({ type: 'boolean', default: false })
	isScholarship!: boolean;

	@Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
	scholarshipAmount?: number | null;

	// ---- Palancas (per-retreat) ----

	@Column({ type: 'varchar', nullable: true })
	palancasCoordinator?: string | null;

	@Column({ type: 'boolean', nullable: true })
	palancasRequested?: boolean | null;

	@Column({ type: 'text', nullable: true })
	palancasReceived?: string | null;

	@Column({ type: 'text', nullable: true })
	palancasNotes?: string | null;

	// ---- Inviter (per-retreat) ----

	@Column({ type: 'varchar', nullable: true })
	invitedBy?: string | null;

	@Column({ type: 'boolean', nullable: true })
	isInvitedByEmausMember?: boolean | null;

	@Column({ type: 'varchar', nullable: true })
	inviterHomePhone?: string | null;

	@Column({ type: 'varchar', nullable: true })
	inviterWorkPhone?: string | null;

	@Column({ type: 'varchar', nullable: true })
	inviterCellPhone?: string | null;

	@Column({ type: 'varchar', nullable: true })
	inviterEmail?: string | null;

	// ---- Logistics (per-retreat) ----

	@Column({ type: 'varchar', nullable: true })
	pickupLocation?: string | null;

	@Column({ type: 'boolean', nullable: true })
	arrivesOnOwn?: boolean | null;

	@Column({ type: 'boolean', nullable: true })
	requestsSingleRoom?: boolean | null;
}
