import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	ManyToOne,
	JoinColumn,
	Index,
} from 'typeorm';
import { Retreat } from './retreat.entity';

@Entity('retreat_memory_song')
@Index('idx_retreat_memory_song_retreatId', ['retreatId'])
export class RetreatMemorySong {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, (retreat) => retreat.memorySongs, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	// Link to the playlist/song (Spotify, YouTube, etc.)
	@Column({ type: 'varchar' })
	url!: string;

	// Optional human-friendly label (e.g. "Cantos del viernes").
	@Column({ type: 'varchar', nullable: true })
	title?: string | null;

	// Origin of the song: 'manual' (added in the Recuerdos form) or 'mam'
	// (imported from the minute-by-minute schedule's musicTrackUrl). Only
	// 'manual' songs participate in the isPrimary / musicPlaylistUrl mirror.
	@Column({ type: 'varchar', default: 'manual' })
	source!: 'manual' | 'mam';

	@Column({ type: 'boolean', default: false })
	isPrimary!: boolean;

	@Column({ type: 'integer', default: 0 })
	sortOrder!: number;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;
}
