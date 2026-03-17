import { QueryResult, QueryResultRow } from 'pg';
import { adminPool } from './adminPool';

export async function adminQuery<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  try {
    return await adminPool.query<T>(text, params);
  } catch (error: any) {
    console.error('Admin query error:', {
      message: error.message,
      code: error.code,
      query: text,
      params,
    });
    throw error;
  }
}

export async function adminQueryOne<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await adminQuery<T>(text, params);
  return result.rows[0] || null;
}

export async function adminQueryMany<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await adminQuery<T>(text, params);
  return result.rows;
}
