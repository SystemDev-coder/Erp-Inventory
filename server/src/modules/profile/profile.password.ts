import { comparePassword, hashPassword } from '../../utils/password';
import { queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';

export const changePassword = async (
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const user = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM ims.users WHERE user_id = $1`,
    [userId]
  );
  if (!user?.password_hash) throw ApiError.notFound('User not found');

  const ok = await comparePassword(currentPassword, user.password_hash);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect');

  const newHash = await hashPassword(newPassword);
  await queryOne(`UPDATE ims.users SET password_hash = $1 WHERE user_id = $2`, [newHash, userId]);
};
