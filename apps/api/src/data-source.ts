import { DataSource } from 'typeorm';
import { House } from './entities/house.entity';
import { Bed } from './entities/bed.entity';
import { Retreat } from './entities/retreat.entity';
import { Table } from './entities/table.entity';
import { Participant } from './entities/participant.entity';
import { User } from './entities/user.entity';
import { RetreatBed } from './entities/retreatBed.entity';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'database.sqlite',
  synchronize: true,
  logging: true,
  entities: [House, Bed, Retreat, RetreatBed, Table, Participant, User],
  migrations: [],
  subscribers: [],
});