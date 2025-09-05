import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToOne, JoinColumn } from 'typeorm';
import { Retreat } from './retreat.entity';
import { Participant } from './participant.entity';

export enum BedType {
  NORMAL = 'normal',
  LITERA = 'litera',
  COLCHON = 'colchon',
}

export enum BedUsage {
  CAMINANTE = 'caminante',
  SERVIDOR = 'servidor',
}

@Entity()
export class RetreatBed {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  roomNumber!: string;

  @Column('varchar')
  bedNumber!: string;

  @Column({ type: 'integer', nullable: true })
  floor?: number;

  @Column({
    type: 'text',
    enum: BedType,
  })
  type!: BedType;

  @Column({
    type: 'text',
    enum: BedUsage,
  })
  defaultUsage!: BedUsage;

  @ManyToOne(() => Retreat, (retreat) => retreat.beds)
  @JoinColumn({ name: 'retreatId' })
  retreat!: Retreat;

  @Column({ type: 'uuid' })
  retreatId!: string;

  @OneToOne(() => Participant, (participant) => participant.retreatBed, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'participantId' })
  participant?: Participant | null;

  @Column({ type: 'uuid', nullable: true })
  participantId?: string | null;
}
