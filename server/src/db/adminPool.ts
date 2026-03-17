import { Pool, PoolConfig } from 'pg';
import { config } from '../config/env';

const adminPoolConfig: PoolConfig = {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.adminUser,
  password: config.db.adminPassword,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

export const adminPool = new Pool(adminPoolConfig);

adminPool.on('connect', async (client) => {
  try {
    await client.query(`SET search_path TO ${config.db.schema}, public`);
  } catch (error) {
    console.error('Failed to set search_path (admin):', error);
  }
});

adminPool.on('error', (err) => {
  console.error('Unexpected admin database error:', err);
});
