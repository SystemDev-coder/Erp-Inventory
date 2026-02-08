import { Pool, PoolConfig } from 'pg';
import { config } from '../config/env';

const poolConfig: PoolConfig = {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

export const pool = new Pool(poolConfig);

// Set search_path for all connections
pool.on('connect', async (client) => {
  try {
    await client.query(`SET search_path TO ${config.db.schema}, public`);
  } catch (error) {
    console.error('Failed to set search_path:', error);
  }
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export const testConnection = async (): Promise<void> => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✓ Database connected successfully');
    console.log(`  Schema: ${config.db.schema}`);
    console.log(`  Time: ${result.rows[0].now}`);
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    throw error;
  }
};
