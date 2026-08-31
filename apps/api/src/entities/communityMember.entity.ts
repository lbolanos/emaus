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

	/**
	 * Cumpleaños del miembro, capturado por la comunidad. Formato de TEXTO,
	 * en uno de dos sabores:
	 *   - 'YYYY-MM-DD' cuando se conoce el año.
	 *   - 'MM-DD'      cuando solo se sabe el día y el mes (caso común).
	 *
	 * No es un tipo fecha a propósito: el año opcional no cabe en un `date`, y
	 * un 'MM-DD' plano no puede desfasarse un día al cruzar zonas horarias.
	 *
	 * NULL no significa "no tiene": la resolución cae al `participant.birthDate`
	 * si ese es creíble. Usar siempre `resolveMemberBirthday(member)` de
	 * `@repo/utils` — leer esta columna a pelo se salta tanto el fallback como
	 * la detección del relleno automático del alta.
	 */
	@Column({ type: 'varchar', length: 10, nullable: true })
	birthDate?: string | null;

	/**
	 * Foto del rostro del miembro, para reconocerlo en las reuniones. Vive en el
	 * miembro y no en el Participant: es material que captura la comunidad, y el
	 * modelo overlay no deja que un community admin toque la identidad global.
	 *
	 * En modo S3 guarda la URL del objeto bajo el prefijo PRIVADO
	 * `community-members/`; hay que servirla con `s3Service.presignPrivateUrl`,
	 * nunca la URL cruda. En modo base64 (dev) guarda el data-URI directo.
	 *
	 * Es PII biométrica: se borra en `anonymizeParticipantByToken` cuando la
	 * persona ejerce su derecho de eliminación.
	 */
	@Column({ type: 'text', nullable: true })
	photoUrl?: string | null;

	/** Key del objeto en S3, para poder borrarlo. NULL en modo base64. */
	@Column({ type: 'varchar', length: 255, nullable: true })
	photoS3Key?: string | null;
}
