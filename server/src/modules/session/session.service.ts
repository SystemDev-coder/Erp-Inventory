import { UpdatePreferencesInput, UpdateSessionLimitInput } from './session.schemas';
import { SessionInfo, UserPreferences } from './session.types';

const defaultPreferences = (): UserPreferences => ({
  user_id: 0,
  theme: 'light',
  accent_color: '#2563EB',
  sidebar_state: 'expanded',
  sidebar_position: 'left',
  sidebar_pinned: true,
  enable_animations: true,
  enable_focus_mode: false,
  enable_hover_effects: true,
  focus_mode_blur_level: 2,
  compact_mode: false,
  show_breadcrumbs: true,
  show_page_transitions: true,
  enable_notifications: true,
  notification_sound: false,
  language: 'en',
  timezone: 'UTC',
  date_format: 'YYYY-MM-DD',
  updated_at: new Date(),
  created_at: new Date(),
});

const preferenceStore = new Map<number, UserPreferences>();

const PERMISSION_CACHE_TTL_MS = 5 * 60 * 1000;

type PermissionCacheEntry = { permissions: string[]; expiresAt: number };

// Fixed: was keyed by userId alone, but a user's effective permission set
// depends on (userId, roleId) together (loadUserPermissions takes both).
// A user reassigned to a new role can still have an old, not-yet-refreshed
// JWT floating around (another tab, hasn't re-logged-in yet) that embeds
// the OLD roleId - a request using that stale token would compute and
// cache permissions for the old role under this same userId, and a
// SEPARATE request using a freshly re-logged-in token (new roleId) for
// the SAME user would then incorrectly read that stale, wrong-role cache
// entry instead of ever recomputing for its own roleId. Confirmed during
// verification: reassigning a test user's role, then hitting one endpoint
// with a stale (old-roleId) token before re-logging in, poisoned the
// cache for the fresh (new-roleId) token's identical userId. Keying by
// `${userId}:${roleId}` keeps every (user, role) combination's cache
// entry fully independent.
const permissionCacheKey = (userId: number, roleId: number) => `${userId}:${roleId}`;
const permissionCache = new Map<string, PermissionCacheEntry>();

export class SessionService {
  async createSession(): Promise<string> {
    return 'local-session';
  }

  async updateSessionActivity(_sessionId: string): Promise<void> {}

  async getSessionByToken(): Promise<null> {
    return null;
  }

  async deactivateSession(_sessionId: string): Promise<void> {}

  async getUserSessions(
    _userId: number,
    _currentSessionId?: string
  ): Promise<SessionInfo[]> {
    return [];
  }

  async logoutOtherSessions(
    _userId: number,
    _currentSessionId: string
  ): Promise<number> {
    return 0;
  }

  async logoutSession(_userId: number, _sessionId: string): Promise<void> {}

  async getUserPreferences(userId: number): Promise<UserPreferences> {
    const existing = preferenceStore.get(userId);
    if (existing) return existing;

    const prefs = {
      ...defaultPreferences(),
      user_id: userId,
    };
    preferenceStore.set(userId, prefs);
    return prefs;
  }

  async updateUserPreferences(
    userId: number,
    input: UpdatePreferencesInput
  ): Promise<UserPreferences> {
    const current = await this.getUserPreferences(userId);
    const next: UserPreferences = {
      ...current,
      ...input,
      user_id: userId,
      updated_at: new Date(),
    };
    preferenceStore.set(userId, next);
    return next;
  }

  async updateSessionLimit(
    _userId: number,
    _input: UpdateSessionLimitInput
  ): Promise<void> {}

  async getCachedPermissions(userId: number, roleId: number): Promise<string[] | null> {
    const key = permissionCacheKey(userId, roleId);
    const entry = permissionCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      permissionCache.delete(key);
      return null;
    }
    return entry.permissions;
  }

  async cachePermissions(userId: number, roleId: number, permissions: string[]): Promise<void> {
    permissionCache.set(permissionCacheKey(userId, roleId), {
      permissions,
      expiresAt: Date.now() + PERMISSION_CACHE_TTL_MS,
    });
  }

  // Drops every cached (userId, roleId) entry for this user - not just the
  // caller's own current roleId - since the caller may not know every
  // roleId a stale, still-valid JWT for this user might embed.
  async invalidatePermissionCache(userId: number): Promise<void> {
    const prefix = `${userId}:`;
    for (const key of permissionCache.keys()) {
      if (key.startsWith(prefix)) permissionCache.delete(key);
    }
  }

  async cleanExpiredSessions(): Promise<{ deleted: number }> {
    return { deleted: 0 };
  }
}

export const sessionService = new SessionService();
