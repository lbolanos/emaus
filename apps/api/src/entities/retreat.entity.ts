import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { House } from './house.entity';
import { Walker } from './walker.entity';
import { Server } from './server.entity';
import { Table } from './table.entity';

@Entity()
export class Retreat {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  parish!: string;

  @Column('date')
  startDate!: Date;

  @Column('date')
  endDate!: Date;

  @Column({ type: 'uuid', nullable: true })
  houseId?: string;

  @ManyToOne(() => House, (house) => house.retreats, { nullable: true })
  house?: House;

  @OneToMany(() => Walker, (walker) => walker.retreat)
  walkers!: Walker[];

  @OneToMany(() => Server, (server) => server.retreat)
  servers!: Server[];

  @OneToMany(() => Table, (table) => table.retreat)
  tables!: Table[];
}