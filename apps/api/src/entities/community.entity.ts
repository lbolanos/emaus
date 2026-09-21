import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
	OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import type { MeetingFlyerOptions } from '@repo/types';
import { CommunityMember } from './communityMember.entity';
import { CommunityMeeting } from './communityMeeting.entity';
import { CommunityAdmin } from './communityAdmin.entity';

export type CommunityStatus = 'pending' | 'active' | 'rejected';

@Entity()
export class Community {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	name!: string;

	@Column({ type: 'text', nullable: true })
	description?: string;

	@Column('varchar')
	address1!: string;

	@Column({ type: 'varchar', nullable: true })
	address2?: string;

	@Column('varchar')
	city!: string;

	@Column('varchar')
	state!: string;

	@Column('varchar')
	zipCode!: string;

	@Column('varchar')
	country!: string;

	@Column({ type: 'float', nullable: true })
	latitude?: number;

	@Column({ type: 'float', nullable: true })
	longitude?: number;

	@Column({ type: 'varchar', nullable: true })
	googleMapsUrl?: string;

	/**
	 * Fondo personalizado del flyer de reunión (URL pública de S3 o data-URI en
	 * dev). NULL → los flyers usan el fondo por defecto (/poster.png).
	 */
	@Column({ type: 'text', nullable: true })
	flyerBackgroundUrl?: string | null;

	/**
	 * Opacidad del recuadro central (glass card) del flyer, 0.3–1.0. NULL → cada
	 * estilo usa su default (~0.8). Se resetea junto con el fondo: es una sola
	 * identidad visual.
	 */
	@Column({ type: 'float', nullable: true })
	flyerCardOpacity?: number | null;

	/**
	 * Design of the "Personalizado" meeting-flyer style (blocks, theme, texts,
	 * images). Community identity like the two columns above: every meeting of
	 * the community inherits it. NULL = never customized. JSON column validated
	 * by meetingFlyerOptionsSchema; the PUT replaces it whole.
	 */
	@Column({ type: 'simple-json', nullable: true })
	flyerOptions?: MeetingFlyerOptions | null;

	/**
	 * IANA timezone (ej. 'America/Mexico_City'). Se infiere desde lat/lon en
	 * create/update via `inferTimezoneFromCoords`. Fallback de runtime cuando
	 * está NULL: 'America/Mexico_City'. Usar `getCommunityTimezone(c)` helper.
	 */
	@Column({ type: 'varchar', length: 64, nullable: true })
	timezone?: string | null;

	@Column({ type: 'uuid', nullable: true })
	createdBy?: string | null;

	@ManyToOne(() => User, { nullable: true })
	@JoinColumn({ name: 'createdBy' })
	creator?: User | null;

	@Column({ type: 'varchar', length: 20, default: 'active' })
	status!: CommunityStatus;

	@Column({ type: 'varchar', nullable: true })
	parish?: string;

	@Column({ type: 'varchar', nullable: true })
	diocese?: string;

	@Column({ type: 'varchar', nullable: true })
	website?: string;

	@Column({ type: 'varchar', nullable: true })
	facebookUrl?: string;

	@Column({ type: 'varchar', nullable: true })
	instagramUrl?: string;

	@Column({ type: 'varchar', nullable: true })
	contactName?: string;

	@Column({ type: 'varchar', nullable: true })
	contactEmail?: string;

	@Column({ type: 'varchar', nullable: true })
	contactPhone?: string;

	@Column({ type: 'datetime', nullable: true })
	submittedAt?: Date;

	@Column({ type: 'datetime', nullable: true })
	approvedAt?: Date;

	@Column({ type: 'uuid', nullable: true })
	approvedBy?: string | null;

	@ManyToOne(() => User, { nullable: true })
	@JoinColumn({ name: 'approvedBy' })
	approver?: User | null;

	@Column({ type: 'text', nullable: true })
	rejectionReason?: string;

	@Column({ type: 'varchar', length: 20, nullable: true })
	defaultMeetingDayOfWeek?: string;

	@Column({ type: 'int', nullable: true })
	defaultMeetingInterval?: number;

	@Column({ type: 'varchar', length: 5, nullable: true })
	defaultMeetingTime?: string;

	@Column({ type: 'int', nullable: true })
	defaultMeetingDurationMinutes?: number;

	@Column({ type: 'text', nullable: true })
	defaultMeetingDescription?: string;

	@OneToMany(() => CommunityMember, (member) => member.community)
	members!: CommunityMember[];

	@OneToMany(() => CommunityMeeting, (meeting) => meeting.community)
	meetings!: CommunityMeeting[];

	@OneToMany(() => CommunityAdmin, (admin) => admin.community)
	admins!: CommunityAdmin[];

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
