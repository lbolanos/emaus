import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';
import { Retreat } from './retreat.entity';
import { Participant } from './participant.entity';

@Entity('retreat_charges')
export class Charge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column('uuid')
  retreatId!: string;

  @ManyToOne(() => Retreat, (retreat) => retreat.charges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'retreatId' })
  retreat!: Retreat;

  @ManyToOne(() => Participant, (participant) => participant.charges, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'participantId' })
  participant?: Participant;

  @Column('uuid', { nullable: true })
  participantId?: string;
}
