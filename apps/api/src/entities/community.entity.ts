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
import { CommunityMember } from './communityMember.entity';
import { CommunityMeeting } from './communityMeeting.entity';
import { CommunityAdmin } from './communityAdmin.entity';

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

	@Column({ type: 'uuid' })
	createdBy!: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'createdBy' })
	creator!: User;

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
