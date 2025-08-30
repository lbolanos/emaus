import { DataSource } from 'typeorm';
import { House } from './entities/house.entity';
import { Room } from './entities/room.entity';
import { Retreat } from './entities/retreat.entity';
import { Table } from './entities/table.entity';
import { Walker } from './entities/walker.entity';
import { Server } from './entities/server.entity';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'database.sqlite',
  synchronize: true,
  logging: true,
  entities: [House, Room, Retreat, Table, Walker, Server],
  migrations: [],
  subscribers: [],
});