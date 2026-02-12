import { queryOne } from '../../db/query';
import { ProfileUpdateInput } from './profile.schemas';

export interface Profile {
  user_id: number;
  name: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  role_id?: number | null;
  role_name?: string | null;
}

export const profileService = {
  getProfile(userId: number): Promise<Profile | null> {
    return queryOne<Profile>(
      `SELECT u.user_id, u.name, u.username, u.email, u.phone, u.role_id, r.role_name
         FROM ims.users u
         LEFT JOIN ims.roles r ON r.role_id = u.role_id
        WHERE u.user_id = $1`,
      [userId]
    );
  },

  async updateProfile(userId: number, input: ProfileUpdateInput): Promise<Profile | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${p++}`);
      values.push(input.name);
    }
    if (input.username !== undefined) {
      updates.push(`username = $${p++}`);
      values.push(input.username);
    }
    if (input.phone !== undefined) {
      updates.push(`phone = $${p++}`);
      values.push(input.phone);
    }

    if (!updates.length) {
      return this.getProfile(userId);
    }

    values.push(userId);

    await queryOne(
      `UPDATE ims.users SET ${updates.join(', ')} WHERE user_id = $${p}`,
      values
    );

    return this.getProfile(userId);
  },
};
