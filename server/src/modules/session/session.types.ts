export interface UserSession {
  session_id: string;
  user_id: number;
  refresh_token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  location: string | null;
  is_active: boolean;
  last_activity: Date;
  expires_at: Date;
  created_at: Date;
}

export interface SessionInfo {
  session_id: string;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  location: string | null;
  last_activity: Date;
  is_current: boolean;
  created_at: Date;
}

export interface UserPreferences {
  user_id: number;
  // Theme
  theme: 'light' | 'dark' | 'auto';
  accent_color: string;
  // Sidebar
  sidebar_state: 'minimized' | 'expanded' | 'floating';
  sidebar_position: 'left' | 'right';
  sidebar_pinned: boolean;
  // Visual Effects
  enable_animations: boolean;
  enable_focus_mode: boolean;
  enable_hover_effects: boolean;
  focus_mode_blur_level: number;
  // Display
  compact_mode: boolean;
  show_breadcrumbs: boolean;
  show_page_transitions: boolean;
  // Notifications
  enable_notifications: boolean;
  notification_sound: boolean;
  // Locale
  language: string;
  timezone: string;
  date_format: string;
  updated_at: Date;
  created_at: Date;
}

export interface DeviceInfo {
  ip: string;
  userAgent: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  browser: string;
  os: string;
}

export interface SidebarMenuItem {
  id: string;
  name: string;
  nameSo: string;
  icon: string;
  route: string;
  permission: string;
  badge?: number | string;
  items?: SidebarSubItem[];
}

export interface SidebarSubItem {
  id: string;
  name: string;
  nameSo: string;
  route: string;
  permission: string;
  badge?: number | string;
}

export interface SidebarMenuResponse {
  modules: SidebarMenuItem[];
  cached: boolean;
  timestamp: Date;
}
