import pool from '../db/pool';
import { hashPassword, comparePassword } from '../utils/password';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  parseExpiry,
  verifyRefreshToken,
} from '../utils/jwt';
import { AppError } from '../middlewares/error';
import { SignupInput, LoginInput } from '../validators/auth.schema';
import { env } from '../utils/env';

interface User {
  user_id: number;
  branch_id: number;
  role_id: number;
  name: string;
  username: string;
  phone: string | null;
  password_hash: string;
  is_active: boolean;
  role_name: string;
  branch_name: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  async signup(data: SignupInput) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get default role (User)
      const roleResult = await client.query(
        "SELECT role_id FROM ims.roles WHERE role_name = 'User' LIMIT 1"
      );
      if (roleResult.rows.length === 0) {
        throw new AppError(500, 'Default user role not found');
      }
      const roleId = roleResult.rows[0].role_id;

      // Get default branch (first branch)
      const branchResult = await client.query(
        'SELECT branch_id FROM ims.branches WHERE is_active = true ORDER BY branch_id LIMIT 1'
      );
      if (branchResult.rows.length === 0) {
        throw new AppError(500, 'No active branch found');
      }
      const branchId = branchResult.rows[0].branch_id;

      // Hash password
      const passwordHash = await hashPassword(data.password);

      // Normalize phone: empty string becomes null
      const phone = data.phone && data.phone.trim() !== '' ? data.phone : null;

      // Insert user
      const insertResult = await client.query(
        `INSERT INTO ims.users (branch_id, role_id, name, username, password_hash, phone, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING user_id, username, name, phone`,
        [branchId, roleId, data.name, data.username, passwordHash, phone]
      );

      await client.query('COMMIT');

      const user = insertResult.rows[0];
      return {
        userId: user.user_id,
        username: user.username,
        name: user.name,
        phone: user.phone,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Authenticate user and generate tokens
   */
  async login(data: LoginInput) {
    // Find user by username or phone
    const userResult = await pool.query<User>(
      `SELECT u.*, r.role_name, b.branch_name
       FROM ims.users u
       JOIN ims.roles r ON u.role_id = r.role_id
       JOIN ims.branches b ON u.branch_id = b.branch_id
       WHERE (u.username = $1 OR u.phone = $1) AND u.is_active = true
       LIMIT 1`,
      [data.identifier]
    );

    if (userResult.rows.length === 0) {
      throw new AppError(401, 'Invalid credentials');
    }

    const user = userResult.rows[0];

    // Verify password
    const isPasswordValid = await comparePassword(
      data.password,
      user.password_hash
    );

    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid credentials');
    }

    // Generate tokens
    const payload = {
      userId: user.user_id,
      username: user.username,
      roleId: user.role_id,
      branchId: user.branch_id,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token hash in database
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + parseExpiry(env.JWT_REFRESH_EXPIRY)
    );

    await pool.query(
      `INSERT INTO ims.refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.user_id, tokenHash, expiresAt]
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.user_id,
        name: user.name,
        username: user.username,
        phone: user.phone,
        role: user.role_name,
        branch: user.branch_name,
      },
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refresh(refreshToken: string) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      const tokenHash = hashToken(refreshToken);

      // Check if token exists and is not revoked
      const tokenResult = await pool.query(
        `SELECT * FROM ims.refresh_tokens 
         WHERE token_hash = $1 AND user_id = $2 AND revoked = false AND expires_at > NOW()
         LIMIT 1`,
        [tokenHash, payload.userId]
      );

      if (tokenResult.rows.length === 0) {
        throw new AppError(401, 'Invalid or expired refresh token');
      }

      // Generate new access token
      const newAccessToken = generateAccessToken({
        userId: payload.userId,
        username: payload.username,
        roleId: payload.roleId,
        branchId: payload.branchId,
      });

      return { accessToken: newAccessToken };
    } catch (error: any) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        throw new AppError(401, 'Invalid or expired refresh token');
      }
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getProfile(userId: number) {
    const userResult = await pool.query<User>(
      `SELECT u.*, r.role_name, b.branch_name
       FROM ims.users u
       JOIN ims.roles r ON u.role_id = r.role_id
       JOIN ims.branches b ON u.branch_id = b.branch_id
       WHERE u.user_id = $1 AND u.is_active = true
       LIMIT 1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }

    const user = userResult.rows[0];
    return {
      id: user.user_id,
      name: user.name,
      username: user.username,
      phone: user.phone,
      role: user.role_name,
      branch: user.branch_name,
    };
  }

  /**
   * Logout user (revoke refresh token)
   */
  async logout(refreshToken: string) {
    try {
      const tokenHash = hashToken(refreshToken);
      
      await pool.query(
        'UPDATE ims.refresh_tokens SET revoked = true WHERE token_hash = $1',
        [tokenHash]
      );

      return { message: 'Logged out successfully' };
    } catch (error) {
      // Silent fail - token might already be invalid
      return { message: 'Logged out successfully' };
    }
  }
}

export default new AuthService();
