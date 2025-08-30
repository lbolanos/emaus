import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { House } from './house.entity';
import { Walker } from './walker.entity';

@Entity()
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  roomNumber!: string;

  @Column('integer')
  capacity!: number;

  @ManyToOne(() => House, (house) => house.rooms)
  house!: House;

  @OneToMany(() => Walker, (walker) => walker.room)
  walkers!: Walker[];
}