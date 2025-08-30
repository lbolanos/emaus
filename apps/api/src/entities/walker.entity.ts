import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Retreat } from './retreat.entity';
import { Table } from './table.entity';
import { Room } from './room.entity';

@Entity()
export class Walker {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  firstName!: string;

  @Column('varchar')
  lastName!: string;

  @Column('varchar')
  email!: string;

  @ManyToOne(() => Retreat, (retreat) => retreat.walkers)
  retreat!: Retreat;

  @ManyToOne(() => Table, (table) => table.walkers, { nullable: true })
  table?: Table;

  @ManyToOne(() => Room, (room) => room.walkers, { nullable: true })
  room?: Room;
}