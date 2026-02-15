import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { hashPassword } from '../../utils/password';
import { ApiError } from '../../utils/ApiError';
import { UserCreateInput, UserUpdateInput } from './users.schemas';

export interface UserRow {
  user_id: number;
  branch_id: number;
  role_id: number;
  name: string;
  username: string;
  is_active: boolean;
  created_at: string;
  role_name?: string | null;
}

export const usersService = {
  async list(): Promise<UserRow[]> {
    return queryMany<UserRow>(
      `SELECT u.*, r.role_name
         FROM ims.users u
         LEFT JOIN ims.roles r ON r.role_id = u.role_id
        ORDER BY u.user_id DESC`
    );
  },

  async listRoles(): Promise<{ role_id: number; role_name: string }[]> {
    return queryMany(`SELECT role_id, role_name FROM ims.roles ORDER BY role_name`);
  },

  async create(input: UserCreateInput): Promise<UserRow> {
    const existing = await queryOne<{ user_id: number }>(
      `SELECT user_id FROM ims.users WHERE username = $1`,
      [input.username]
    );
    if (existing) {
      throw ApiError.conflict('Username already exists');
    }

    const passwordHash = await hashPassword(input.password);

    const created = await withTransaction(async (client) => {
      const row = await client.query<UserRow>(
        `INSERT INTO ims.users (branch_id, role_id, name, username, password_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.branchId,
          input.roleId,
          input.name,
          input.username,
          passwordHash,
          input.isActive ?? true,
        ]
      );

      const user = row.rows[0];
      await client.query(`DELETE FROM ims.user_branch WHERE user_id = $1`, [user.user_id]);
      await client.query(
        `INSERT INTO ims.user_branch (user_id, branch_id, is_primary)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (user_id, branch_id) DO UPDATE SET is_primary = TRUE`,
        [user.user_id, input.branchId]
      );

      return user;
    });

    return created;
  },

  async update(id: number, input: UserUpdateInput): Promise<UserRow | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (input.branchId !== undefined) {
      updates.push(`branch_id = $${p++}`);
      values.push(input.branchId);
    }
    if (input.roleId !== undefined) {
      updates.push(`role_id = $${p++}`);
      values.push(input.roleId);
    }
    if (input.name !== undefined) {
      updates.push(`name = $${p++}`);
      values.push(input.name);
    }
    if (input.username !== undefined) {
      const existing = await queryOne<{ user_id: number }>(
        `SELECT user_id FROM ims.users WHERE username = $1 AND user_id <> $2`,
        [input.username, id]
      );
      if (existing) {
        throw ApiError.conflict('Username already exists');
      }
      updates.push(`username = $${p++}`);
      values.push(input.username);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${p++}`);
      values.push(input.isActive);
    }
    if (input.password !== undefined) {
      const hash = await hashPassword(input.password);
      updates.push(`password_hash = $${p++}`);
      values.push(hash);
    }

    const updated = await withTransaction(async (client) => {
      let user: UserRow | null;

      if (!updates.length) {
        const row = await client.query<UserRow>(
          `SELECT u.*, r.role_name
             FROM ims.users u
             LEFT JOIN ims.roles r ON r.role_id = u.role_id
            WHERE u.user_id = $1`,
          [id]
        );
        user = row.rows[0] ?? null;
      } else {
        values.push(id);
        const row = await client.query<UserRow>(
          `UPDATE ims.users
              SET ${updates.join(', ')}
            WHERE user_id = $${p}
            RETURNING *`,
          values
        );
        user = row.rows[0] ?? null;
      }

      if (user && input.branchId !== undefined) {
        await client.query(`DELETE FROM ims.user_branch WHERE user_id = $1`, [id]);
        await client.query(
          `INSERT INTO ims.user_branch (user_id, branch_id, is_primary)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (user_id, branch_id) DO UPDATE SET is_primary = TRUE`,
          [id, input.branchId]
        );
      }

      return user;
    });

    return updated;
  },

  get(id: number): Promise<UserRow | null> {
    return queryOne<UserRow>(
      `SELECT u.*, r.role_name
         FROM ims.users u
         LEFT JOIN ims.roles r ON r.role_id = u.role_id
        WHERE u.user_id = $1`,
      [id]
    );
  },

  async remove(id: number): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM ims.user_branch WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM ims.users WHERE user_id = $1`, [id]);
      return null;
    });
  },
};
