import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import {
  comparePassword,
  generateResetCode,
  hashPassword,
} from '../../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  TokenPayload,
} from '../../utils/jwt';
import { config } from '../../config/env';
import {
  AuthTokens,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  User,
  UserProfile,
  UserWithPermissions,
} from './auth.types';
import { logAudit } from '../../utils/audit';

type ResetEntry = {
  userId: number;
  code: string;
  expiresAt: Date;
};

const resetStore = new Map<string, ResetEntry>();

const normalizeIdentifier = (value: string) => value.trim().toLowerCase();

const now = () => new Date();

const defaultPermissions: string[] = [];

const ensureRole = async (requestedRoleId?: number): Promise<number> => {
  if (requestedRoleId) {
    const role = await queryOne<{ role_id: number }>(
      `SELECT role_id
         FROM ims.roles
        WHERE role_id = $1`,
      [requestedRoleId]
    );
    if (role) return Number(role.role_id);
  }

  const fallbackRole = await queryOne<{ role_id: number }>(
    `SELECT role_id
       FROM ims.roles
      ORDER BY role_id
      LIMIT 1`
  );

  if (!fallbackRole) {
    throw ApiError.badRequest('No role is configured in the database');
  }

  return Number(fallbackRole.role_id);
};

const ensureBranch = async (requestedBranchId?: number): Promise<number> => {
  if (requestedBranchId) {
    const branch = await queryOne<{ branch_id: number }>(
      `SELECT branch_id
         FROM ims.branches
        WHERE branch_id = $1
          AND is_active = TRUE`,
      [requestedBranchId]
    );
    if (branch) return Number(branch.branch_id);
  }

  const fallbackBranch = await queryOne<{ branch_id: number }>(
    `SELECT branch_id
       FROM ims.branches
      WHERE is_active = TRUE
      ORDER BY branch_id
      LIMIT 1`
  );

  if (!fallbackBranch) {
    throw ApiError.badRequest('No active branch is configured in the database');
  }

  return Number(fallbackBranch.branch_id);
};

const getPrimaryBranch = async (userId: number): Promise<number> => {
  const row = await queryOne<{ branch_id: number }>(
    `SELECT ub.branch_id
       FROM ims.user_branches ub
       JOIN ims.branches b ON b.branch_id = ub.branch_id
      WHERE ub.user_id = $1
        AND b.is_active = TRUE
      ORDER BY ub.is_default DESC, ub.branch_id
      LIMIT 1`,
    [userId]
  );

  if (row) return Number(row.branch_id);

  return ensureBranch(undefined);
};

const resolveIdentifierToUsername = (input: RegisterInput) => {
  const username = input.username?.trim();
  if (username) return username;

  const phone = input.phone?.trim();
  if (phone) return phone;

  throw ApiError.badRequest('Username is required');
};

const mapProfile = async (userId: number): Promise<UserProfile | null> => {
  const row = await queryOne<{
    user_id: number;
    name: string;
    username: string;
    role_id: number;
    role_name: string | null;
    is_active: boolean;
    branch_id: number | null;
    branch_name: string | null;
  }>(
    `SELECT
        u.user_id,
        u.name,
        u.username,
        u.role_id,
        r.role_name,
        u.is_active,
        b.branch_id,
        b.branch_name
     FROM ims.users u
     LEFT JOIN ims.roles r ON r.role_id = u.role_id
     LEFT JOIN LATERAL (
       SELECT br.branch_id, br.branch_name
         FROM ims.user_branches ub
         JOIN ims.branches br ON br.branch_id = ub.branch_id
        WHERE ub.user_id = u.user_id
        ORDER BY ub.is_default DESC, ub.branch_id
        LIMIT 1
     ) b ON TRUE
     WHERE u.user_id = $1`,
    [userId]
  );

  if (!row) return null;

  const branchId = Number(row.branch_id || (await ensureBranch(undefined)));
  const branchName = row.branch_name || 'Main Branch';

  return {
    user_id: Number(row.user_id),
    name: row.name,
    username: row.username,
    phone: null,
    role_id: Number(row.role_id),
    role_name: row.role_name || 'User',
    branch_id: branchId,
    branch_name: branchName,
    is_active: Boolean(row.is_active),
  };
};

const buildTokenPayload = async (
  user: Pick<User, 'user_id' | 'username' | 'role_id'>
): Promise<TokenPayload> => {
  const branchId = await getPrimaryBranch(Number(user.user_id));
  return {
    userId: Number(user.user_id),
    username: user.username,
    roleId: Number(user.role_id),
    branchId,
  };
};

export class AuthService {
  async register(
    input: RegisterInput
  ): Promise<{ tokens: AuthTokens; user: UserProfile }> {
    return withTransaction(async (client) => {
      const username = resolveIdentifierToUsername(input);
      const existingUser = await client.query<{ user_id: number }>(
        `SELECT user_id
           FROM ims.users
          WHERE LOWER(username) = LOWER($1)
          LIMIT 1`,
        [username]
      );
      if (existingUser.rows[0]) {
        throw ApiError.conflict('Username already exists');
      }

      const roleId = await ensureRole(input.role_id);
      const branchId = await ensureBranch(input.branch_id);
      const passwordHash = await hashPassword(input.password);

      const inserted = await client.query<User>(
        `INSERT INTO ims.users (role_id, name, username, password_hash, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING user_id, role_id, name, username, password_hash, is_active, created_at`,
        [roleId, input.name.trim(), username, passwordHash]
      );

      const createdUser = inserted.rows[0];
      await client.query(
        `INSERT INTO ims.user_branches (user_id, branch_id, is_default)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (user_id, branch_id)
         DO UPDATE SET is_default = TRUE`,
        [createdUser.user_id, branchId]
      );

      const payload = await buildTokenPayload(createdUser);
      const tokens = {
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
      };

      const profile = await mapProfile(Number(createdUser.user_id));
      if (!profile) {
        throw ApiError.internal('Failed to load user profile');
      }

      await logAudit({
        userId: Number(createdUser.user_id),
        action: 'auth.register',
        entity: 'users',
        entityId: Number(createdUser.user_id),
        branchId,
      });

      return { tokens, user: profile };
    });
  }

  async login(
    input: LoginInput
  ): Promise<{ tokens: AuthTokens; user: UserProfile }> {
    const identifier = normalizeIdentifier(input.identifier);
    const user = await queryOne<User>(
      `SELECT user_id, role_id, name, username, password_hash, is_active, created_at
         FROM ims.users
        WHERE LOWER(username) = $1
        LIMIT 1`,
      [identifier]
    );

    if (!user) {
      throw ApiError.unauthorized('Incorrect username or password');
    }

    if (!user.is_active) {
      throw ApiError.forbidden(
        'You are not authorized to access this section. Please contact the system administrator.'
      );
    }

    const isValid = await comparePassword(input.password, user.password_hash);
    if (!isValid) {
      throw ApiError.unauthorized('Incorrect username or password');
    }

    const payload = await buildTokenPayload(user);
    const tokens = {
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
    };

    const userProfile = await mapProfile(Number(user.user_id));
    if (!userProfile) {
      throw ApiError.internal('Failed to retrieve user profile');
    }

    await logAudit({
      userId: Number(user.user_id),
      action: 'auth.login',
      entity: 'users',
      entityId: Number(user.user_id),
      branchId: payload.branchId,
      ip: input.ip,
      userAgent: input.userAgent || null,
    });

    return { tokens, user: userProfile };
  }

  async refresh(refreshToken: string): Promise<string> {
    let payload: TokenPayload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const user = await queryOne<User>(
      `SELECT user_id, role_id, name, username, password_hash, is_active, created_at
         FROM ims.users
        WHERE user_id = $1`,
      [payload.userId]
    );

    if (!user || !user.is_active) {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    const nextPayload = await buildTokenPayload(user);
    return signAccessToken(nextPayload);
  }

  async logout(_userId: number): Promise<void> {}

  async getUserProfileById(userId: number): Promise<UserProfile | null> {
    return mapProfile(userId);
  }

  async getUserWithPermissions(userId: number): Promise<UserWithPermissions> {
    const user = await this.getUserProfileById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const rolePerms = await queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
         FROM ims.role_permissions rp
         JOIN ims.permissions p ON p.perm_id = rp.perm_id
        WHERE rp.role_id = $1`,
      [user.role_id]
    );

    const userPerms = await queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
         FROM ims.user_permissions up
         JOIN ims.permissions p ON p.perm_id = up.perm_id
        WHERE up.user_id = $1`,
      [userId]
    );

    const allowOverrides = await queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
         FROM ims.user_permission_overrides uo
         JOIN ims.permissions p ON p.perm_id = uo.perm_id
        WHERE uo.user_id = $1
          AND uo.effect = 'allow'`,
      [userId]
    );

    const denyOverrides = await queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
         FROM ims.user_permission_overrides uo
         JOIN ims.permissions p ON p.perm_id = uo.perm_id
        WHERE uo.user_id = $1
          AND uo.effect = 'deny'`,
      [userId]
    );

    const permissionSet = new Set<string>([
      ...rolePerms.map((row) => row.perm_key),
      ...userPerms.map((row) => row.perm_key),
      ...allowOverrides.map((row) => row.perm_key),
    ]);

    denyOverrides.forEach((row) => permissionSet.delete(row.perm_key));

    return {
      user,
      role: {
        role_id: user.role_id,
        role_name: user.role_name,
      },
      permissions: Array.from(permissionSet),
    };
  }

  async forgotPassword(
    input: ForgotPasswordInput
  ): Promise<{ resetCode?: string }> {
    const user = await queryOne<{ user_id: number; is_active: boolean; username: string }>(
      `SELECT user_id, is_active, username
         FROM ims.users
        WHERE LOWER(username) = $1
        LIMIT 1`,
      [normalizeIdentifier(input.identifier)]
    );

    if (!user || !user.is_active) {
      if (config.resetPassword.devReturnCode) {
        return { resetCode: '000000' };
      }
      return {};
    }

    const code = generateResetCode();
    const expiresAt = new Date(now().getTime() + config.resetPassword.expiresMin * 60 * 1000);

    resetStore.set(normalizeIdentifier(user.username), {
      userId: Number(user.user_id),
      code,
      expiresAt,
    });

    if (config.resetPassword.devReturnCode) {
      return { resetCode: code };
    }

    return {};
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const identifier = normalizeIdentifier(input.identifier);
    const entry = resetStore.get(identifier);
    if (!entry) {
      throw ApiError.badRequest('No password reset requested');
    }

    if (entry.expiresAt.getTime() < now().getTime()) {
      resetStore.delete(identifier);
      throw ApiError.badRequest('Reset code has expired');
    }

    if (entry.code !== input.code) {
      throw ApiError.badRequest('Invalid reset code');
    }

    const newPasswordHash = await hashPassword(input.newPassword);
    await queryOne(
      `UPDATE ims.users
          SET password_hash = $1
        WHERE user_id = $2`,
      [newPasswordHash, entry.userId]
    );

    resetStore.delete(identifier);
  }
}

export const authService = new AuthService();
