import { pool } from './pool';
import { QueryResult, QueryResultRow } from 'pg';

/**
 * Safe query helper with automatic error handling
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error: any) {
    console.error('Query error:', {
      message: error.message,
      code: error.code,
      query: text,
      params,
    });
    throw error;
  }
}

/**
 * Query and return first row or null
 */
export async function queryOne<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] || null;
}

/**
 * Query and return all rows
 */
export async function queryMany<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/**
 * Check if a record exists
 */
export async function exists(
  table: string,
  condition: string,
  params?: any[]
): Promise<boolean> {
  const result = await query(
    `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${condition})`,
    params
  );
  return result.rows[0].exists;
}
