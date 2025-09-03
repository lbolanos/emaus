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
  address!: string;

  @Column('varchar', { nullable: true })
  googleMapsUrl?: string;

  @OneToMany(() => Bed, (bed) => bed.house)
  beds!: Bed[];

  @OneToMany(() => Retreat, (retreat) => retreat.house)
  retreats!: Retreat[];
}