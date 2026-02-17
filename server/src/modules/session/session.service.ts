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

  async getCachedPermissions(_userId: number): Promise<string[] | null> {
    return null;
  }

  async cachePermissions(_userId: number, _permissions: string[]): Promise<void> {}

  async invalidatePermissionCache(_userId: number): Promise<void> {}

  async cleanExpiredSessions(): Promise<{ deleted: number }> {
    return { deleted: 0 };
  }
}

export const sessionService = new SessionService();
