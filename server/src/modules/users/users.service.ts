import { queryMany, queryOne } from '../../db/query';
import { hashPassword } from '../../utils/password';
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
    const passwordHash = await hashPassword(input.password);
    return queryOne<UserRow>(
      `INSERT INTO ims.users (branch_id, role_id, name, username, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        input.branchId,
        input.roleId,
        input.name,
        input.username,
        passwordHash,
        input.isActive ?? true,
      ]
    ) as Promise<UserRow>;
  },

  async update(id: number, input: UserUpdateInput): Promise<UserRow | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (input.branchId !== undefined) { updates.push(`branch_id = $${p++}`); values.push(input.branchId); }
    if (input.roleId !== undefined) { updates.push(`role_id = $${p++}`); values.push(input.roleId); }
    if (input.name !== undefined) { updates.push(`name = $${p++}`); values.push(input.name); }
    if (input.username !== undefined) { updates.push(`username = $${p++}`); values.push(input.username); }
    if (input.isActive !== undefined) { updates.push(`is_active = $${p++}`); values.push(input.isActive); }
    if (input.password !== undefined) {
      const hash = await hashPassword(input.password);
      updates.push(`password_hash = $${p++}`);
      values.push(hash);
    }

    if (!updates.length) {
      return this.get(id);
    }

    values.push(id);
    return queryOne<UserRow>(
      `UPDATE ims.users SET ${updates.join(', ')} WHERE user_id = $${p} RETURNING *`,
      values
    );
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
    await queryOne(`DELETE FROM ims.users WHERE user_id = $1`, [id]);
  },
};
