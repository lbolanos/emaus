import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { House } from './house.entity';
import { Participant } from './participant.entity';

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

  @OneToMany(() => Participant, (participant) => participant.room)
  participants!: Participant[];
}