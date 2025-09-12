import { DataSource } from 'typeorm';
import { createDatabaseConfig } from './database/config';

export const AppDataSource = new DataSource(createDatabaseConfig());
