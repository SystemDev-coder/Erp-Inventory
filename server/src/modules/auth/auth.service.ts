import { queryOne, queryMany } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import {
  hashPassword,
  comparePassword,
  generateResetCode,
  hashResetCode,
  compareResetCode,
} from '../../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  TokenPayload,
} from '../../utils/jwt';
import { config } from '../../config/env';
import {
  User,
  UserProfile,
  AuthTokens,
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from './auth.types';
import { sessionService } from '../session/session.service';
import { parseDeviceInfo } from '../../utils/deviceDetection';

export class AuthService {
  /**
   * Register a new user
   */
  async register(input: RegisterInput): Promise<{ tokens: AuthTokens; user: UserProfile }> {
    return withTransaction(async (client) => {
      // Set defaults
      const branchId = input.branch_id || 1;
      const roleId = input.role_id || 1;

      // Hash password
      const passwordHash = await hashPassword(input.password);

      // Insert user
      const insertQuery = `
        INSERT INTO ims.users (branch_id, role_id, name, username, phone, password_hash, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        RETURNING user_id, branch_id, role_id, name, username, phone
      `;

      const result = await client.query(insertQuery, [
        branchId,
        roleId,
        input.name,
        input.username || null,
        input.phone || null,
        passwordHash,
      ]);

      const user = result.rows[0];

      // Generate tokens
      const payload: TokenPayload = {
        userId: user.user_id,
        username: user.username || user.phone,
        roleId: user.role_id,
        branchId: user.branch_id,
      };

      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);

      // Store refresh token hash
      const tokenHash = hashToken(refreshToken);
      await client.query(
        'UPDATE ims.users SET refresh_token_hash = $1, last_login_at = NOW() WHERE user_id = $2',
        [tokenHash, user.user_id]
      );

      // Get user profile within transaction
      const profileResult = await client.query<UserProfile>(
        `SELECT 
          u.user_id,
          u.name,
          u.username,
          u.phone,
          u.role_id,
          u.branch_id,
          u.is_active,
          COALESCE(r.role_name, 'User') as role_name,
          COALESCE(b.branch_name, 'Main Branch') as branch_name
         FROM ims.users u
         LEFT JOIN ims.roles r ON u.role_id = r.role_id
         LEFT JOIN ims.branches b ON u.branch_id = b.branch_id
         WHERE u.user_id = $1`,
        [user.user_id]
      );

      const userProfile = profileResult.rows[0];
      if (!userProfile) {
        throw ApiError.internal('Failed to retrieve user profile');
      }

      return {
        tokens: { accessToken, refreshToken },
        user: userProfile,
      };
    });
  }

  /**
   * Login user
   */
  async login(input: LoginInput): Promise<{ tokens: AuthTokens; user: UserProfile }> {
    // Find user by username or phone
    const user = await queryOne<User>(
      `SELECT * FROM ims.users 
       WHERE (username = $1 OR phone = $1) AND is_active = true`,
      [input.identifier]
    );

    if (!user) {
      throw ApiError.unauthorized('Incorrect username or password');
    }

    // Verify password
    const isValid = await comparePassword(input.password, user.password_hash);
    if (!isValid) {
      throw ApiError.unauthorized('Incorrect username or password');
    }

    // Generate tokens
    const payload: TokenPayload = {
      userId: user.user_id,
      username: user.username || user.phone || '',
      roleId: user.role_id,
      branchId: user.branch_id,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // Store refresh token hash
    const tokenHash = hashToken(refreshToken);
    await queryOne(
      'UPDATE ims.users SET refresh_token_hash = $1, last_login_at = NOW() WHERE user_id = $2',
      [tokenHash, user.user_id]
    );

    // Get user profile
    const userProfile = await this.getUserProfileById(user.user_id);
    if (!userProfile) {
      throw ApiError.internal('Failed to retrieve user profile');
    }

    return {
      tokens: { accessToken, refreshToken },
      user: userProfile,
    };
  }

  /**
   * Refresh access token
   */
  async refresh(refreshToken: string): Promise<string> {
    let payload: TokenPayload;
    
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    // Verify token hash in database
    const tokenHash = hashToken(refreshToken);
    const user = await queryOne<User>(
      'SELECT * FROM ims.users WHERE user_id = $1 AND refresh_token_hash = $2 AND is_active = true',
      [payload.userId, tokenHash]
    );

    if (!user) {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    // Generate new access token with clean payload (no exp, iat, etc.)
    const newAccessToken = signAccessToken({
      userId: payload.userId,
      username: payload.username,
      roleId: payload.roleId,
      branchId: payload.branchId,
      sessionId: payload.sessionId,
    });

    // Optional: Rotate refresh token (recommended for production)
    // For simplicity, we're not rotating here, but you can add it

    return newAccessToken;
  }

  /**
   * Logout user
   */
  async logout(userId: number): Promise<void> {
    await queryOne(
      'UPDATE ims.users SET refresh_token_hash = NULL WHERE user_id = $1',
      [userId]
    );
  }

  /**
   * Get user profile by ID
   */
  async getUserProfileById(userId: number): Promise<UserProfile | null> {
    return queryOne<UserProfile>(
      `SELECT 
        u.user_id,
        u.name,
        u.username,
        u.phone,
        u.role_id,
        u.branch_id,
        u.is_active,
        COALESCE(r.role_name, 'User') as role_name,
        COALESCE(b.branch_name, 'Main Branch') as branch_name
       FROM ims.users u
       LEFT JOIN ims.roles r ON u.role_id = r.role_id
       LEFT JOIN ims.branches b ON u.branch_id = b.branch_id
       WHERE u.user_id = $1`,
      [userId]
    );
  }

  /**
   * Get user with full permissions (role + overrides)
   * Formula: effective = (role_permissions ∪ user_permissions ∪ overrides_allow) - overrides_deny
   */
  async getUserWithPermissions(userId: number): Promise<any | null> {
    const user = await this.getUserProfileById(userId);
    if (!user) return null;

    // Get role permissions
    const rolePerms = await queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
       FROM ims.role_permissions rp
       JOIN ims.permissions p ON rp.perm_id = p.perm_id
       WHERE rp.role_id = $1`,
      [user.role_id]
    );

    // Get legacy user permission overrides (allow only)
    const userPerms = await queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
       FROM ims.user_permissions up
       JOIN ims.permissions p ON up.perm_id = p.perm_id
       WHERE up.user_id = $1`,
      [userId]
    );

    // Get allow overrides
    const allowOverrides = await queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
       FROM ims.user_permission_overrides upo
       JOIN ims.permissions p ON upo.perm_id = p.perm_id
       WHERE upo.user_id = $1 AND upo.effect = 'allow'`,
      [userId]
    );

    // Get deny overrides
    const denyOverrides = await queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
       FROM ims.user_permission_overrides upo
       JOIN ims.permissions p ON upo.perm_id = p.perm_id
       WHERE upo.user_id = $1 AND upo.effect = 'deny'`,
      [userId]
    );

    // Apply formula: (role ∪ legacy ∪ allow) - deny
    const allowed = new Set([
      ...rolePerms.map((p) => p.perm_key),
      ...userPerms.map((p) => p.perm_key),
      ...allowOverrides.map((p) => p.perm_key),
    ]);

    const denied = new Set(denyOverrides.map((p) => p.perm_key));

    // Remove denied permissions
    denied.forEach((perm) => allowed.delete(perm));

    return {
      user,
      role: {
        role_id: user.role_id,
        role_name: user.role_name,
      },
      permissions: Array.from(allowed),
    };
  }

  /**
   * Request password reset
   */
  async forgotPassword(input: ForgotPasswordInput): Promise<{ resetCode?: string }> {
    // Find user
    const user = await queryOne<User>(
      `SELECT * FROM ims.users 
       WHERE (username = $1 OR phone = $1) AND is_active = true`,
      [input.identifier]
    );

    if (!user) {
      // Don't reveal if user exists
      if (config.resetPassword.devReturnCode) {
        return { resetCode: '000000' };
      }
      return {};
    }

    // Generate reset code
    const code = generateResetCode();
    const codeHash = await hashResetCode(code);
    const expiresAt = new Date(Date.now() + config.resetPassword.expiresMin * 60 * 1000);

    // Store in database
    await queryOne(
      `UPDATE ims.users 
       SET reset_code_hash = $1, reset_code_expires = $2 
       WHERE user_id = $3`,
      [codeHash, expiresAt, user.user_id]
    );

    // In dev mode, return code for testing
    if (config.resetPassword.devReturnCode) {
      return { resetCode: code };
    }

    // In production, send SMS/Email (implement later)
    console.log(`[DEV] Reset code for ${input.identifier}: ${code}`);

    return {};
  }

  /**
   * Reset password with code
   */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    return withTransaction(async (client) => {
      // Find user
      const result = await client.query<User>(
        `SELECT * FROM ims.users 
         WHERE (username = $1 OR phone = $1) AND is_active = true`,
        [input.identifier]
      );

      const user = result.rows[0];
      if (!user) {
        throw ApiError.badRequest('Invalid reset request');
      }

      // Check if reset code exists and not expired
      if (!user.reset_code_hash || !user.reset_code_expires) {
        throw ApiError.badRequest('No password reset requested');
      }

      if (new Date() > new Date(user.reset_code_expires)) {
        throw ApiError.badRequest('Reset code has expired');
      }

      // Verify code
      const isValid = await compareResetCode(input.code, user.reset_code_hash);
      if (!isValid) {
        throw ApiError.badRequest('Invalid reset code');
      }

      // Update password
      const newPasswordHash = await hashPassword(input.newPassword);
      await client.query(
        `UPDATE ims.users 
         SET password_hash = $1, 
             reset_code_hash = NULL, 
             reset_code_expires = NULL,
             refresh_token_hash = NULL
         WHERE user_id = $2`,
        [newPasswordHash, user.user_id]
      );
    });
  }
}

export const authService = new AuthService();
