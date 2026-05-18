import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
	OneToMany,
	Unique,
} from 'typeorm';
import { Community } from './community.entity';
import { Participant } from './participant.entity';
import { CommunityAttendance } from './communityAttendance.entity';

@Entity()
@Unique(['communityId', 'participantId'])
export class CommunityMember {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	communityId!: string;

	@ManyToOne(() => Community, (community) => community.members, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'communityId' })
	community!: Community;

	@Column({ type: 'uuid' })
	participantId!: string;

	@ManyToOne(() => Participant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant!: Participant;

	@Column({
		type: 'varchar',
		default: 'active_member',
	})
	state!:
		| 'far_from_location'
		| 'no_answer'
		| 'another_group'
		| 'active_member'
		| 'pending_verification';

	@OneToMany(() => CommunityAttendance, (attendance) => attendance.member)
	attendances!: CommunityAttendance[];

	@CreateDateColumn()
	joinedAt!: Date;

	@Column({ type: 'text', nullable: true })
	notes?: string | null;

	@UpdateDateColumn()
	updatedAt!: Date;

	// Auditoría de cambios de estado (G5)
	@Column({ type: 'varchar', length: 36, nullable: true })
	verifiedBy?: string | null;

	@Column({ type: 'datetime', nullable: true })
	verifiedAt?: Date | null;

	@Column({ type: 'varchar', length: 50, nullable: true })
	previousState?: string | null;

	// Overlay de perfil por-comunidad. NULL = usar el Participant subyacente
	// como fuente. Cuando un community admin edita el nombre/contacto de un
	// miembro, el cambio queda aquí, no en `participants` (evita pisar la
	// identidad global del Participant y el vector de account takeover).
	// Resolución vía helper `resolveMemberProfile(member)` en `@repo/utils`.
	@Column({ type: 'varchar', length: 100, nullable: true })
	firstName?: string | null;

	@Column({ type: 'varchar', length: 100, nullable: true })
	lastName?: string | null;

	@Column({ type: 'varchar', length: 254, nullable: true })
	email?: string | null;

	@Column({ type: 'varchar', length: 30, nullable: true })
	cellPhone?: string | null;
}
