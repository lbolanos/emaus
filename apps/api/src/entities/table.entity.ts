import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Retreat } from './retreat.entity';
import { Participant } from './participant.entity';

@Entity()
export class Table {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  @Column('uuid')
  retreatId!: string;

  @ManyToOne(() => Retreat, (retreat) => retreat.tables, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'retreatId' })
  retreat!: Retreat;

  @OneToMany(() => Participant, (participant) => participant.table)
  participants!: Participant[];
}