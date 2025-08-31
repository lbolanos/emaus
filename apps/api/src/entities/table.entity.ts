import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Retreat } from './retreat.entity';
import { Participant } from './participant.entity';

@Entity()
export class Table {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  @ManyToOne(() => Retreat, (retreat) => retreat.tables)
  retreat!: Retreat;

  @OneToMany(() => Participant, (participant) => participant.table)
  participants!: Participant[];
}