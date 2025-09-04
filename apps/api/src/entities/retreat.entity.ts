import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { House } from './house.entity';
import { Participant } from './participant.entity';
import { Table } from './table.entity';
import { RetreatBed } from './retreatBed.entity';

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

  @Column({ type: 'uuid' })
  houseId!: string;

  @ManyToOne(() => House, (house) => house.retreats, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'houseId' })
  house!: House;

  @OneToMany(() => Participant, (participant) => participant.retreat)
  participants!: Participant[];

  @OneToMany(() => Table, (table) => table.retreat)
  tables!: Table[];

  @OneToMany(() => RetreatBed, (bed) => bed.retreat)
  beds!: RetreatBed[];

  @Column({ type: 'text', nullable: true })
  openingNotes?: string;

  @Column({ type: 'text', nullable: true })
  closingNotes?: string;

  @Column({ type: 'text', nullable: true })
  thingsToBringNotes?: string;
}