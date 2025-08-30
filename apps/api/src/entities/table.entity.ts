import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Retreat } from './retreat.entity';
import { Walker } from './walker.entity';
import { Server } from './server.entity';

@Entity()
export class Table {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  @ManyToOne(() => Retreat, (retreat) => retreat.tables)
  retreat!: Retreat;

  @OneToMany(() => Walker, (walker) => walker.table)
  walkers!: Walker[];

  @OneToMany(() => Server, (server) => server.table)
  servers!: Server[];
}