import { Pool, PoolConfig, PoolClient } from 'pg';
import { config } from '../config/env';

const quoteIdent = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

// pg-pool's `verify(client, callback)` option runs synchronously-awaited on
// every brand-new physical connection, before that connection can be handed
// to ANY caller (pool.connect() or pool.query() - pool.query() itself calls
// pool.connect() internally, so both paths are covered by the same hook).
// This is unlike the `connect` event, which fires-and-forgets an async
// handler: the pool does not wait for it, so a freshly-created connection
// could serve an application query - as the unrestricted `postgres` login
// role, before RLS-relevant session setup below has run - while that
// handler was still in flight. `verify` is the mechanism pg-pool ships
// specifically to make a new connection's setup awaitable before use.
// It is not typed in @types/pg, hence the local extension below.
type PoolConfigWithVerify = PoolConfig & {
  verify?: (client: PoolClient, callback: (err?: Error) => void) => void;
};

const initializeClient = async (client: PoolClient): Promise<void> => {
  const schema = quoteIdent(config.db.schema);
  // Production incident fix: CREATE SCHEMA IF NOT EXISTS still requires
  // CREATE privilege on the database to even attempt the statement, even
  // when the schema already exists - Postgres checks that permission before
  // the existence check. The restricted runtime role this app actually logs
  // in as in production (e.g. ims_app) only has CONNECT, not CREATE, on the
  // database, so this unconditionally crashed every single connection with
  // "permission denied for database <name>" and took the app down in a
  // restart loop. Schema creation is a one-time provisioning/migration
  // concern (handled by entrypoint.sh, running as postgres), not something
  // every pooled connection needs to re-attempt - skip it here the same way
  // the SET ROLE below already tolerates a restricted role.
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  } catch {
    // ignore - the schema already exists and this role isn't allowed to
    // (re-)create it, which is fine; only a missing schema is fatal, and
    // that would still surface immediately below when search_path fails.
  }
  await client.query(`SET search_path TO ${config.db.schema}, public`);

  // Force a restricted runtime role so RLS (soft-delete filtering) works
  // even though the login user is postgres. If the role doesn't exist
  // (legacy env), this is skipped without failing the connection.
  const runtimeRole = process.env.APP_RUNTIME_ROLE || 'ims_runtime';
  try {
    await client.query(`SET ROLE ${quoteIdent(runtimeRole)}`);
  } catch {
    // ignore - legacy environments without the restricted role
  }

  await client.query(`SET app.include_deleted = '0'`);
};

const poolConfig: PoolConfigWithVerify = {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  verify: (client, callback) => {
    initializeClient(client).then(
      () => callback(),
      (error: Error) => {
        console.error('Failed to initialize new database connection:', error);
        callback(error);
      }
    );
  },
};

export const pool = new Pool(poolConfig);

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
