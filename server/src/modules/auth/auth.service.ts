import { PoolClient } from 'pg';
import { query, queryMany, queryOne } from '../../db/query';
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
  LockSetInput,
  LockVerifyInput,
  User,
  UserProfile,
  UserWithPermissions,
} from './auth.types';
import { logAudit } from '../../utils/audit';
import { isAdminRoleRecord } from '../../utils/branchScope';

type ResetEntry = {
  userId: number;
  code: string;
  expiresAt: Date;
};

const resetStore = new Map<string, ResetEntry>();

const normalizeIdentifier = (value: string) => value.trim().toLowerCase();

const now = () => new Date();

// CRIT-01 fix: this used to accept a client-supplied role_id and trust it
// outright, falling back to `ORDER BY role_id LIMIT 1` (which is the seeded
// Administrator role) when none was given - meaning the public /register
// endpoint's default outcome was a full admin account. This is no longer
// parameterized at all: every self-registered account gets the same fixed,
// intentionally low-privilege "Viewer" role (read-only access), looked up
// by its stable role_code rather than a role_id that could differ across
// deployments/seeds. Real privilege assignment happens exclusively through
// the authenticated Employees/Users admin flow, never through registration.
const ensureRole = async (): Promise<number> => {
  const viewerRole = await queryOne<{ role_id: number }>(
    `SELECT role_id
       FROM ims.roles
      WHERE role_code = 'VIEWER'
      LIMIT 1`
  );

  if (!viewerRole) {
    throw ApiError.internal('Default registration role is not configured');
  }

  return Number(viewerRole.role_id);
};

const ensureBranch = async (): Promise<number> => {
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

  return ensureBranch();
};

const resolveIdentifierToUsername = (input: RegisterInput) => {
  const username = input.username?.trim();
  if (username) return username;

  const phone = input.phone?.trim();
  if (phone) return phone;

  throw ApiError.badRequest('Username is required');
};

// CRIT-01b fix: register() calls this from inside an open withTransaction()
// while that transaction's INSERT hasn't committed yet. The default path
// below (no client passed) runs via the shared pool - a different physical
// connection - which under READ COMMITTED can never see the other,
// still-open transaction's uncommitted row, so it always returned null and
// registration always failed. Callers with an open transaction must pass
// their `client` so this reads through the same connection/transaction
// instead. login() (no open transaction) continues to omit it, unchanged.
const mapProfile = async (userId: number, client?: PoolClient): Promise<UserProfile | null> => {
  const exec = client ? client.query.bind(client) : query;
  const result = await exec<{
    user_id: number;
    name: string;
    username: string;
    role_id: number;
    role_name: string | null;
    role_code: string | null;
    is_system: boolean | null;
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
        r.role_code,
        r.is_system,
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
  const row = result.rows[0];

  if (!row) return null;

  const branchId = Number(row.branch_id || (await ensureBranch()));
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
    is_admin: isAdminRoleRecord(row),
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

      // CRIT-01 fix: role_id/branch_id are never accepted from this
      // (unauthenticated) input - see ensureRole()/ensureBranch() for why.
      const roleId = await ensureRole();
      const branchId = await ensureBranch();
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

      // CRIT-01b fix: build the token payload directly from what was just
      // inserted in this same transaction, instead of buildTokenPayload()
      // -> getPrimaryBranch(), which re-queries via the pool and can't see
      // this transaction's still-uncommitted rows.
      const payload: TokenPayload = {
        userId: Number(createdUser.user_id),
        username: createdUser.username,
        roleId: Number(createdUser.role_id),
        branchId,
      };
      const tokens = {
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
      };

      // CRIT-01b fix: pass this transaction's client through so mapProfile
      // reads the just-inserted (still uncommitted) rows on the same
      // connection, instead of via the pool.
      const profile = await mapProfile(Number(createdUser.user_id), client);
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

  async setLockPassword(userId: number, input: LockSetInput): Promise<void> {
    const hashed = await hashPassword(input.password);
    await queryOne(
      `INSERT INTO ims.user_locks (user_id, lock_hash)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET lock_hash = EXCLUDED.lock_hash, updated_at = NOW()`,
      [userId, hashed]
    );
  }

  async verifyLockPassword(userId: number, input: LockVerifyInput): Promise<void> {
    const row = await queryOne<{ lock_hash: string }>(
      `SELECT lock_hash FROM ims.user_locks WHERE user_id = $1`,
      [userId]
    );

    if (!row) {
      throw ApiError.notFound('Lock password not set');
    }

    const ok = await comparePassword(input.password, row.lock_hash);
    if (!ok) {
      throw ApiError.unauthorized('Invalid lock password');
    }
  }

  async clearLockPassword(userId: number): Promise<void> {
    await queryOne(`DELETE FROM ims.user_locks WHERE user_id = $1`, [userId]);
  }
}

export const authService = new AuthService();
