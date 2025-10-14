import { Entity, Column, PrimaryColumn, Index, DeleteDateColumn } from 'typeorm';
import { ISession } from 'connect-typeorm';

@Entity({ name: 'sessions' })
export class Session implements ISession {
  @Index()
  @Column('bigint')
  public expiredAt: number;

  @PrimaryColumn('varchar', { length: 255 })
  public id: string;

  @Column('text')
  public json: string;

  @DeleteDateColumn()
  public destroyedAt?: Date;
}