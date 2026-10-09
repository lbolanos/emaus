import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Descarte de un falso positivo del detector de duplicados: "no son la misma
 * persona". Lo crea el owner desde el listado de duplicados o el hint de
 * attendance stats; `loadDuplicateGroups` filtra estos pares, así lista, badge
 * y hint dejan de proponerlos a la vez.
 *
 * El par es canónico (participantAId < participantBId, CHECK en la tabla): el
 * servicio ordena antes de escribir, y B,A y A,B son la misma fila.
 */
@Entity('community_duplicate_dismissal')
@Index('UQ_dup_dismissal_pair', ['communityId', 'participantAId', 'participantBId'], {
	unique: true,
})
export class CommunityDuplicateDismissal {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 36 })
	communityId!: string;

	@Column({ type: 'varchar', length: 36 })
	participantAId!: string;

	@Column({ type: 'varchar', length: 36 })
	participantBId!: string;

	@Column({ name: 'dismissedBy', type: 'varchar', length: 36, nullable: true })
	dismisserId?: string | null;

	@CreateDateColumn()
	createdAt!: Date;
}
