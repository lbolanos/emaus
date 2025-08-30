import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Room } from './room.entity';
import { Retreat } from './retreat.entity';

@Entity()
export class House {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  @Column('varchar')
  address!: string;

  @Column('integer')
  capacity!: number;

  @OneToMany(() => Room, (room) => room.house)
  rooms!: Room[];

  @OneToMany(() => Retreat, (retreat) => retreat.house)
  retreats!: Retreat[];
}