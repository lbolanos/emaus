import { DataSource } from 'typeorm';
import { House } from './entities/house.entity';
import { Bed } from './entities/bed.entity';
import { Retreat } from './entities/retreat.entity';
import { TableMesa } from './entities/tableMesa.entity';
import { Participant } from './entities/participant.entity';
import { User } from './entities/user.entity';
import { RetreatBed } from './entities/retreatBed.entity';
import { Charge } from './entities/charge.entity';


export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'database.sqlite',
  synchronize: true,
  logging: false,
  entities: [House, Bed, Retreat, RetreatBed, TableMesa, Participant, User, Charge],
  migrations: [],
  subscribers: [],
});