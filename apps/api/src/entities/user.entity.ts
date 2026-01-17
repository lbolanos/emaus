import {
	Entity,
	PrimaryColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	BeforeInsert,
	BeforeUpdate,
	OneToMany,
	ManyToOne,
	JoinColumn,
	OneToOne,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserRole } from './userRole.entity';
import { UserRetreat } from './userRetreat.entity';
import { Retreat } from './retreat.entity';
import { Payment } from './payment.entity';
import { Participant } from './participant.entity';
import { UserProfile } from './userProfile.entity';
import { Friend } from './friend.entity';
import { Follow } from './follow.entity';

@Entity('users')
export class User {
	@PrimaryColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', unique: true, nullable: true })
	googleId?: string | null;

	@Column({ type: 'varchar', unique: true })
	email!: string;

	@Column({ type: 'varchar' })
	displayName!: string;

	@Column({ type: 'varchar', nullable: true })
	photo?: string;

	@Column({ type: 'varchar', nullable: true })
	password?: string | null;

	@Column({ type: 'boolean', default: false })
	isPending?: boolean;

	@Column({ type: 'varchar', nullable: true })
	invitationToken?: string;

	@Column({ type: 'datetime', nullable: true })
	invitationExpiresAt?: Date;

	@Column({ type: 'uuid', nullable: true })
	participantId?: string | null;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@OneToMany(() => UserRole, (userRole) => userRole.user)
	userRoles!: UserRole[];

	@OneToMany(() => UserRetreat, (userRetreat) => userRetreat.user)
	userRetreats!: UserRetreat[];

	@OneToMany(() => Retreat, (retreat) => retreat.creator)
	createdRetreats!: Retreat[];

	@OneToMany(() => UserRetreat, (userRetreat) => userRetreat.inviter)
	sentInvitations!: UserRetreat[];

	@OneToMany(() => Payment, (payment) => payment.recordedByUser)
	recordedPayments!: Payment[];

	// Social relationships
	@OneToOne(() => UserProfile, (profile) => profile.user, { cascade: true })
	profile?: UserProfile;

	@ManyToOne(() => Participant, { nullable: true })
	@JoinColumn({ name: 'participantId' })
	participant?: Participant | null;

	@OneToMany(() => Friend, (friend) => friend.user)
	friends!: Friend[];

	@OneToMany(() => Friend, (friend) => friend.friendOf)
	friendOf!: Friend[];

	@OneToMany(() => Follow, (follow) => follow.follower)
	following!: Follow[];

	@OneToMany(() => Follow, (follow) => follow.following)
	followers!: Follow[];

	@BeforeInsert()
	@BeforeUpdate()
	async hashPassword() {
		if (this.password) {
			this.password = await bcrypt.hash(this.password, 10);
		}
	}
}
