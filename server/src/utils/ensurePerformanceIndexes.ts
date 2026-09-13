import fs from 'fs';
import path from 'path';
import { adminQueryMany } from '../db/adminQuery';

let performanceIndexesReady = false;

const resolveSqlFile = (fileName: string): string | null => {
  const candidates = [
    path.resolve(process.cwd(), 'sql', fileName),
    path.resolve(process.cwd(), 'server', 'sql', fileName),
    path.resolve(process.cwd(), '..', 'server', 'sql', fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

export const ensurePerformanceIndexes = async (): Promise<void> => {
  if (performanceIndexesReady) return;

  const sqlFile = resolveSqlFile('20260901_performance_indexes.sql');
  if (!sqlFile) {
    console.warn('Performance index migration file not found; skipping index creation.');
    performanceIndexesReady = true;
    return;
  }

  const sql = fs.readFileSync(sqlFile, 'utf8');
  await adminQueryMany(sql);
  performanceIndexesReady = true;
  console.log('Performance indexes ensured.');
};
