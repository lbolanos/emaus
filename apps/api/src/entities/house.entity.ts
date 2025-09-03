import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Bed } from './bed.entity';
import { Retreat } from './retreat.entity';

@Entity()
export class House {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  @Column('varchar')
  address1!: string;

  @Column('varchar', { nullable: true })
  address2?: string;

  @Column('varchar')
  city!: string;

  @Column('varchar')
  state!: string;

  @Column('varchar')
  zipCode!: string;

  @Column('varchar')
  country!: string;

  @Column('integer')
  capacity!: number;

  @Column('float', { nullable: true })
  latitude?: number;

  @Column('float', { nullable: true })
  longitude?: number;

  @Column('varchar', { nullable: true })
  googleMapsUrl?: string;

  @Column('text', { nullable: true })
  notes?: string;

  @OneToMany(() => Bed, (bed) => bed.house)
  beds!: Bed[];

  @OneToMany(() => Retreat, (retreat) => retreat.house)
  retreats!: Retreat[];
}