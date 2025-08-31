import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { Table } from './table.entity';
import { Room } from './room.entity';

@Entity('participants')
export class Participant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  type!: 'walker' | 'server';

  @Column('varchar')
  firstName!: string;

  @Column('varchar')
  lastName!: string;

  @Column({ type: 'varchar', nullable: true })
  nickname?: string;

  @Column('date')
  birthDate!: Date;

  @Column('varchar')
  maritalStatus!:
    | 'single'
    | 'married'
    | 'separated_divorced'
    | 'widowed'
    | 'other';

  @Column('varchar')
  street!: string;

  @Column('varchar')
  houseNumber!: string;

  @Column('varchar')
  postalCode!: string;

  @Column('varchar')
  neighborhood!: string;

  @Column('varchar')
  city!: string;

  @Column('varchar')
  state!: string;

  @Column('varchar')
  country!: string;

  @Column({ type: 'varchar', nullable: true })
  parish?: string;

  @Column({ type: 'varchar', nullable: true })
  homePhone?: string;

  @Column({ type: 'varchar', nullable: true })
  workPhone?: string;

  @Column('varchar')
  cellPhone!: string;

  @Column('varchar')
  email!: string;

  @Column('varchar')
  occupation!: string;

  @Column('boolean')
  snores!: boolean;

  @Column('boolean')
  hasMedication!: boolean;

  @Column({ type: 'varchar', nullable: true })
  medicationDetails?: string;

  @Column({ type: 'varchar', nullable: true })
  medicationSchedule?: string;

  @Column('boolean')
  hasDietaryRestrictions!: boolean;

  @Column({ type: 'varchar', nullable: true })
  dietaryRestrictionsDetails?: string;

  @Column('simple-array')
  sacraments!: string[];

  @Column('varchar')
  emergencyContact1Name!: string;

  @Column('varchar')
  emergencyContact1Relation!: string;

  @Column({ type: 'varchar', nullable: true })
  emergencyContact1HomePhone?: string;

  @Column({ type: 'varchar', nullable: true })
  emergencyContact1WorkPhone?: string;

  @Column('varchar')
  emergencyContact1CellPhone!: string;

  @Column({ type: 'varchar', nullable: true })
  emergencyContact1Email?: string;

  @Column({ type: 'varchar', nullable: true })
  emergencyContact2Name?: string;

  @Column({ type: 'varchar', nullable: true })
  emergencyContact2Relation?: string;

  @Column({ type: 'varchar', nullable: true })
  emergencyContact2HomePhone?: string;

  @Column({ type: 'varchar', nullable: true })
  emergencyContact2WorkPhone?: string;

  @Column({ type: 'varchar', nullable: true })
  emergencyContact2CellPhone?: string;

  @Column({ type: 'varchar', nullable: true })
  emergencyContact2Email?: string;

  @Column({ type: 'varchar', nullable: true })
  tshirtSize?: 'S' | 'M' | 'L' | 'XL' | 'XXL';

  @Column({ type: 'varchar', nullable: true })
  invitedBy?: string;

  @Column({ type: 'boolean', nullable: true })
  isInvitedByEmausMember?: boolean;

  @Column({ type: 'varchar', nullable: true })
  inviterHomePhone?: string;

  @Column({ type: 'varchar', nullable: true })
  inviterWorkPhone?: string;

  @Column({ type: 'varchar', nullable: true })
  inviterCellPhone?: string;

  @Column({ type: 'varchar', nullable: true })
  inviterEmail?: string;

  @Column({ type: 'varchar', nullable: true })
  pickupLocation?: string;

  @Column({ type: 'boolean', nullable: true })
  arrivesOnOwn?: boolean;

  @Column('uuid')
  retreatId!: string;

  @ManyToOne(() => Retreat, (retreat) => retreat.participants)
  @JoinColumn({ name: 'retreatId' })
  retreat!: Retreat;

  @Column({ type: 'uuid', nullable: true })
  tableId?: string;

  @ManyToOne(() => Table, (table) => table.participants, { nullable: true })
  @JoinColumn({ name: 'tableId' })
  table?: Table;

  @Column({ type: 'uuid', nullable: true })
  roomId?: string;

  @ManyToOne(() => Room, (room) => room.participants, { nullable: true })
  @JoinColumn({ name: 'roomId' })
  room?: Room;
}
