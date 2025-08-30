import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Retreat } from './retreat.entity';
import { Table } from './table.entity';

@Entity()
export class Server {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  firstName!: string;

  @Column('varchar')
  lastName!: string;

  @Column('varchar')
  role!: string;

  @ManyToOne(() => Retreat, (retreat) => retreat.servers)
  retreat!: Retreat;

  @ManyToOne(() => Table, (table) => table.servers, { nullable: true })
  table?: Table;
}