import { query, queryOne, queryMany } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { parseDeviceInfo, getLocationFromIP } from '../../utils/deviceDetection';
import crypto from 'crypto';
import {
  UserSession,
  SessionInfo,
  UserPreferences,
  DeviceInfo,
  SidebarMenuResponse,
} from './session.types';
import { UpdatePreferencesInput, UpdateSessionLimitInput } from './session.schemas';

export class SessionService {
  /**
   * Create a new session with concurrent login management
   */
  async createSession(
    userId: number,
    refreshTokenHash: string,
    deviceInfo: DeviceInfo,
    expiresAt: Date
  ): Promise<string> {
    return withTransaction(async (client) => {
      // Get session limit for user
      const limit = await queryOne<{ max_sessions: number }>(
        'SELECT max_sessions FROM ims.concurrent_session_limits WHERE user_id = $1',
        [userId]
      );

      const maxSessions = limit?.max_sessions || 2;

      // Count active sessions
      const activeCount = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ims.user_sessions 
         WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()`,
        [userId]
      );

      // If at limit, deactivate oldest session
      if (activeCount && Number(activeCount.count) >= maxSessions) {
        await client.query(
          `UPDATE ims.user_sessions 
           SET is_active = FALSE 
           WHERE session_id = (
             SELECT session_id FROM ims.user_sessions 
             WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
             ORDER BY last_activity ASC 
             LIMIT 1
           )`,
          [userId]
        );
      }

      // Get location from IP
      const location = await getLocationFromIP(deviceInfo.ip);

      // Create new session
      const result = await client.query<{ session_id: string }>(
        `INSERT INTO ims.user_sessions (
          user_id, refresh_token_hash, ip_address, user_agent, 
          device_type, browser, os, location, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING session_id`,
        [
          userId,
          refreshTokenHash,
          deviceInfo.ip,
          deviceInfo.userAgent,
          deviceInfo.deviceType,
          deviceInfo.browser,
          deviceInfo.os,
          location,
          expiresAt,
        ]
      );

      return result.rows[0].session_id;
    });
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    await query(
      `UPDATE ims.user_sessions 
       SET last_activity = NOW() 
       WHERE session_id = $1 AND is_active = TRUE`,
      [sessionId]
    );
  }

  /**
   * Get session by refresh token hash
   */
  async getSessionByToken(refreshTokenHash: string): Promise<UserSession | null> {
    return queryOne<UserSession>(
      `SELECT * FROM ims.user_sessions 
       WHERE refresh_token_hash = $1 AND is_active = TRUE AND expires_at > NOW()`,
      [refreshTokenHash]
    );
  }

  /**
   * Deactivate session (logout)
   */
  async deactivateSession(sessionId: string): Promise<void> {
    await query(
      'UPDATE ims.user_sessions SET is_active = FALSE WHERE session_id = $1',
      [sessionId]
    );
  }

  /**
   * Get all active sessions for user
   */
  async getUserSessions(userId: number, currentSessionId?: string): Promise<SessionInfo[]> {
    const sessions = await queryMany<UserSession>(
      `SELECT session_id, device_type, browser, os, ip_address, location, 
              last_activity, created_at
       FROM ims.user_sessions 
       WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
       ORDER BY last_activity DESC`,
      [userId]
    );

    return sessions.map((session) => ({
      session_id: session.session_id,
      device_type: session.device_type,
      browser: session.browser,
      os: session.os,
      ip_address: session.ip_address,
      location: session.location,
      last_activity: session.last_activity,
      is_current: session.session_id === currentSessionId,
      created_at: session.created_at,
    }));
  }

  /**
   * Logout from all other sessions
   */
  async logoutOtherSessions(userId: number, currentSessionId: string): Promise<number> {
    const result = await query(
      `UPDATE ims.user_sessions 
       SET is_active = FALSE 
       WHERE user_id = $1 AND session_id != $2 AND is_active = TRUE
       RETURNING session_id`,
      [userId, currentSessionId]
    );

    return result.rowCount || 0;
  }

  /**
   * Logout specific session
   */
  async logoutSession(userId: number, sessionId: string): Promise<void> {
    const result = await query(
      `UPDATE ims.user_sessions 
       SET is_active = FALSE 
       WHERE user_id = $1 AND session_id = $2`,
      [userId, sessionId]
    );

    if (result.rowCount === 0) {
      throw ApiError.notFound('Session not found');
    }
  }

  /**
   * Get user preferences (create defaults if not exist)
   */
  async getUserPreferences(userId: number): Promise<UserPreferences> {
    let prefs = await queryOne<UserPreferences>(
      'SELECT * FROM ims.user_preferences WHERE user_id = $1',
      [userId]
    );

    if (!prefs) {
      // Create default preferences
      prefs = await queryOne<UserPreferences>(
        `INSERT INTO ims.user_preferences (user_id) 
         VALUES ($1) 
         RETURNING *`,
        [userId]
      );
    }

    return prefs!;
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(
    userId: number,
    input: UpdatePreferencesInput
  ): Promise<UserPreferences> {
    // Build dynamic UPDATE query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = $${paramCount++}`);
        values.push(value);
      }
    });

    if (updates.length === 0) {
      return this.getUserPreferences(userId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    const prefs = await queryOne<UserPreferences>(
      `UPDATE ims.user_preferences 
       SET ${updates.join(', ')} 
       WHERE user_id = $${paramCount}
       RETURNING *`,
      values
    );

    if (!prefs) {
      throw ApiError.notFound('Preferences not found');
    }

    return prefs;
  }

  /**
   * Update concurrent session limit
   */
  async updateSessionLimit(
    userId: number,
    input: UpdateSessionLimitInput
  ): Promise<void> {
    await query(
      `INSERT INTO ims.concurrent_session_limits (user_id, max_sessions, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET max_sessions = $2, updated_at = NOW()`,
      [userId, input.max_sessions]
    );
  }

  /**
   * Get cached permissions for user
   */
  async getCachedPermissions(userId: number): Promise<string[] | null> {
    const cached = await queryOne<{ permissions: string[]; expires_at: Date }>(
      `SELECT permissions, expires_at FROM ims.permission_cache 
       WHERE user_id = $1 AND expires_at > NOW()`,
      [userId]
    );

    if (cached) {
      return cached.permissions;
    }

    return null;
  }

  /**
   * Cache permissions for user
   */
  async cachePermissions(userId: number, permissions: string[]): Promise<void> {
    const permissionsHash = crypto
      .createHash('sha256')
      .update(permissions.sort().join(','))
      .digest('hex');

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await query(
      `INSERT INTO ims.permission_cache (user_id, permissions, permissions_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE 
       SET permissions = $2, permissions_hash = $3, expires_at = $4`,
      [userId, JSON.stringify(permissions), permissionsHash, expiresAt]
    );
  }

  /**
   * Invalidate permission cache
   */
  async invalidatePermissionCache(userId: number): Promise<void> {
    await query('DELETE FROM ims.permission_cache WHERE user_id = $1', [userId]);
    await query('DELETE FROM ims.sidebar_menu_cache WHERE user_id = $1', [userId]);
  }

  /**
   * Clean expired sessions (maintenance task)
   */
  async cleanExpiredSessions(): Promise<{ deleted: number }> {
    const result = await query(
      `DELETE FROM ims.user_sessions 
       WHERE expires_at < NOW() OR (is_active = FALSE AND last_activity < NOW() - INTERVAL '7 days')
       RETURNING session_id`
    );

    await query('DELETE FROM ims.sidebar_menu_cache WHERE expires_at < NOW()');
    await query('DELETE FROM ims.permission_cache WHERE expires_at < NOW()');

    return { deleted: result.rowCount || 0 };
  }
}

export const sessionService = new SessionService();
