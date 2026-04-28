import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';
import { adminQueryOne } from '../db/adminQuery';

const findBaseSchemaFile = (): string | null => {
  const candidates = [
    process.env.BASE_SCHEMA_PATH,
    path.resolve(process.cwd(), 'sql', 'Full_complete_scheme.sql'),
    path.resolve(process.cwd(), 'server', 'sql', 'Full_complete_scheme.sql'),
    path.resolve(process.cwd(), '..', 'sql', 'Full_complete_scheme.sql'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
};

const runPsqlFile = async (filePath: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const args = [
      '-h',
      config.db.host,
      '-p',
      String(config.db.port),
      '-U',
      config.db.adminUser,
      '-d',
      config.db.database,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      filePath,
    ];

    const child = spawn('psql', args, {
      env: {
        ...process.env,
        PGPASSWORD: config.db.adminPassword,
      },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`psql exited with code ${code}`));
    });
  });
};

export const ensureBaseSchema = async (): Promise<void> => {
  const branchesRow = await adminQueryOne<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS "exists"`,
    [`${config.db.schema}.branches`]
  );
  const accountsRow = await adminQueryOne<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS "exists"`,
    [`${config.db.schema}.accounts`]
  );

  const branchesExists = Boolean(branchesRow?.exists);
  const accountsExists = Boolean(accountsRow?.exists);

  if (branchesExists && accountsExists) return;

  const schemaFile = findBaseSchemaFile();
  if (!schemaFile) {
    throw new Error(
      `Base schema missing (tables ${config.db.schema}.branches / ${config.db.schema}.accounts not found) and Full_complete_scheme.sql was not found. Expected at /app/sql/Full_complete_scheme.sql in Docker.`
    );
  }

  console.log(
    `Base schema missing; applying Full_complete_scheme.sql from ${schemaFile}...`
  );
  await runPsqlFile(schemaFile);
};

