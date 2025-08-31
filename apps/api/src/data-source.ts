import { DataSource } from 'typeorm';
import { House } from './entities/house.entity';
import { Room } from './entities/room.entity';
import { Retreat } from './entities/retreat.entity';
import { Table } from './entities/table.entity';
import { Participant } from './entities/participant.entity';
import { User } from './entities/user.entity';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'database.sqlite',
  synchronize: true,
  logging: true,
  entities: [House, Room, Retreat, Table, Participant, User],
  migrations: [],
  subscribers: [],
});