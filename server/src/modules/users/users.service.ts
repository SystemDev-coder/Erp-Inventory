import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { hashPassword } from '../../utils/password';
import { ApiError } from '../../utils/ApiError';
import {
  UserCreateInput,
  UserGenerateFromEmployeeInput,
  UserUpdateInput,
} from './users.schemas';

export interface UserRow {
  user_id: number;
  branch_id: number;
  role_id: number;
  name: string;
  username: string;
  is_active: boolean;
  created_at: string;
  role_name?: string | null;
  emp_id?: number | null;
  emp_name?: string | null;
}

const ensureRole = async (roleId?: number): Promise<number> => {
  if (roleId) {
    const existing = await queryOne<{ role_id: number }>(
      `SELECT role_id FROM ims.roles WHERE role_id = $1`,
      [roleId]
    );
    if (existing) return Number(existing.role_id);
  }

  const fallback = await queryOne<{ role_id: number }>(
    `SELECT role_id
       FROM ims.roles
      ORDER BY role_id
      LIMIT 1`
  );
  if (!fallback) {
    throw ApiError.badRequest('No role exists in the system');
  }
  return Number(fallback.role_id);
};

const ensureBranch = async (branchId?: number): Promise<number> => {
  if (branchId) {
    const existing = await queryOne<{ branch_id: number }>(
      `SELECT branch_id
         FROM ims.branches
        WHERE branch_id = $1
          AND is_active = TRUE`,
      [branchId]
    );
    if (existing) return Number(existing.branch_id);
  }

  const fallback = await queryOne<{ branch_id: number }>(
    `SELECT branch_id
       FROM ims.branches
      WHERE is_active = TRUE
      ORDER BY branch_id
      LIMIT 1`
  );
  if (!fallback) {
    throw ApiError.badRequest('No active branch exists in the system');
  }
  return Number(fallback.branch_id);
};

const getUserRow = async (id: number): Promise<UserRow | null> =>
  queryOne<UserRow>(
    `SELECT
        u.user_id,
        COALESCE(ub.branch_id, 0) AS branch_id,
        u.role_id,
        u.name,
        u.username,
        u.is_active,
        u.created_at::text AS created_at,
        r.role_name,
        e.emp_id,
        e.full_name AS emp_name
     FROM ims.users u
     LEFT JOIN ims.roles r ON r.role_id = u.role_id
     LEFT JOIN LATERAL (
       SELECT branch_id
         FROM ims.user_branches
        WHERE user_id = u.user_id
        ORDER BY is_default DESC, branch_id
        LIMIT 1
     ) ub ON TRUE
     LEFT JOIN ims.employees e ON e.user_id = u.user_id
     WHERE u.user_id = $1`,
    [id]
  );

export const usersService = {
  async list(): Promise<UserRow[]> {
    return queryMany<UserRow>(
      `SELECT
          u.user_id,
          COALESCE(ub.branch_id, 0) AS branch_id,
          u.role_id,
          u.name,
          u.username,
          u.is_active,
          u.created_at::text AS created_at,
          r.role_name,
          e.emp_id,
          e.full_name AS emp_name
       FROM ims.users u
       LEFT JOIN ims.roles r ON r.role_id = u.role_id
       LEFT JOIN LATERAL (
         SELECT branch_id
           FROM ims.user_branches
          WHERE user_id = u.user_id
          ORDER BY is_default DESC, branch_id
          LIMIT 1
       ) ub ON TRUE
       LEFT JOIN ims.employees e ON e.user_id = u.user_id
       ORDER BY u.user_id DESC`
    );
  },

  async listRoles(): Promise<{ role_id: number; role_name: string }[]> {
    return queryMany<{ role_id: number; role_name: string }>(
      `SELECT role_id, role_name
         FROM ims.roles
        ORDER BY role_name`
    );
  },

  async create(input: UserCreateInput): Promise<UserRow> {
    const username = input.username.trim().toLowerCase();
    const existing = await queryOne<{ user_id: number }>(
      `SELECT user_id
         FROM ims.users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1`,
      [username]
    );
    if (existing) {
      throw ApiError.conflict('Username already exists');
    }

    const roleId = await ensureRole(input.roleId);
    const branchId = await ensureBranch(input.branchId);
    const passwordHash = await hashPassword(input.password);

    const createdId = await withTransaction(async (client) => {
      const inserted = await client.query<{ user_id: number }>(
        `INSERT INTO ims.users (role_id, name, username, password_hash, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING user_id`,
        [roleId, input.name, username, passwordHash, input.isActive ?? true]
      );
      const userId = Number(inserted.rows[0].user_id);

      await client.query(
        `INSERT INTO ims.user_branches (user_id, branch_id, is_default)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (user_id, branch_id)
         DO UPDATE SET is_default = TRUE`,
        [userId, branchId]
      );

      return userId;
    });

    const row = await getUserRow(createdId);
    if (!row) {
      throw ApiError.internal('Failed to load created user');
    }
    return row;
  },

  async update(id: number, input: UserUpdateInput): Promise<UserRow | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${parameter++}`);
      values.push(input.name);
    }

    if (input.username !== undefined) {
      const username = input.username.trim().toLowerCase();
      const existing = await queryOne<{ user_id: number }>(
        `SELECT user_id
           FROM ims.users
          WHERE LOWER(username) = LOWER($1)
            AND user_id <> $2
          LIMIT 1`,
        [username, id]
      );
      if (existing) {
        throw ApiError.conflict('Username already exists');
      }
      updates.push(`username = $${parameter++}`);
      values.push(username);
    }

    if (input.roleId !== undefined) {
      const roleId = await ensureRole(input.roleId);
      updates.push(`role_id = $${parameter++}`);
      values.push(roleId);
    }

    if (input.isActive !== undefined) {
      updates.push(`is_active = $${parameter++}`);
      values.push(input.isActive);
    }

    if (input.password) {
      const passwordHash = await hashPassword(input.password);
      updates.push(`password_hash = $${parameter++}`);
      values.push(passwordHash);
    }

    await withTransaction(async (client) => {
      if (updates.length) {
        values.push(id);
        await client.query(
          `UPDATE ims.users
              SET ${updates.join(', ')}
            WHERE user_id = $${parameter}`,
          values
        );
      }

      if (input.branchId !== undefined) {
        const branchId = await ensureBranch(input.branchId);
        await client.query(
          `UPDATE ims.user_branches
              SET is_default = FALSE
            WHERE user_id = $1`,
          [id]
        );
        await client.query(
          `INSERT INTO ims.user_branches (user_id, branch_id, is_default)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (user_id, branch_id)
           DO UPDATE SET is_default = TRUE`,
          [id, branchId]
        );
      }
    });

    return getUserRow(id);
  },

  get(id: number): Promise<UserRow | null> {
    return getUserRow(id);
  },

  async remove(id: number): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM ims.user_branches WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM ims.users WHERE user_id = $1`, [id]);
      return null;
    });
  },

  async generateFromEmployee(
    input: UserGenerateFromEmployeeInput
  ): Promise<{ user: UserRow; username: string; password: string }> {
    const employee = await queryOne<{
      emp_id: number;
      full_name: string;
      user_id: number | null;
      branch_id: number;
    }>(
      `SELECT emp_id, full_name, user_id, branch_id
         FROM ims.employees
        WHERE emp_id = $1`,
      [input.empId]
    );

    if (!employee) {
      throw ApiError.notFound('Employee not found');
    }
    if (employee.user_id) {
      throw ApiError.conflict('Employee already has a user account');
    }

    const base = employee.full_name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.]/g, '') || `employee${employee.emp_id}`;

    let username = base;
    let counter = 1;
    while (true) {
      const existing = await queryOne<{ user_id: number }>(
        `SELECT user_id FROM ims.users WHERE username = $1 LIMIT 1`,
        [username]
      );
      if (!existing) break;
      username = `${base}${counter++}`;
    }

    const password = `${base.split('.')[0] || 'user'}@${new Date().getFullYear()}${Math.floor(
      100 + Math.random() * 900
    )}`;
    const passwordHash = await hashPassword(password);
    const roleId = await ensureRole(undefined);
    const branchId = await ensureBranch(employee.branch_id);

    const userId = await withTransaction(async (client) => {
      const inserted = await client.query<{ user_id: number }>(
        `INSERT INTO ims.users (role_id, name, username, password_hash, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING user_id`,
        [roleId, employee.full_name, username, passwordHash]
      );

      const createdUserId = Number(inserted.rows[0].user_id);
      await client.query(
        `INSERT INTO ims.user_branches (user_id, branch_id, is_default)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (user_id, branch_id)
         DO UPDATE SET is_default = TRUE`,
        [createdUserId, branchId]
      );

      await client.query(
        `UPDATE ims.employees
            SET user_id = $1
          WHERE emp_id = $2`,
        [createdUserId, input.empId]
      );

      return createdUserId;
    });

    const user = await getUserRow(userId);
    if (!user) {
      throw ApiError.internal('Failed to load generated user');
    }

    return {
      user,
      username,
      password,
    };
  },
};
