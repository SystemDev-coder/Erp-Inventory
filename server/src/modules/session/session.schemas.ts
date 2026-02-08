import { z } from 'zod';

export const updatePreferencesSchema = z.object({
  // Theme
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  accent_color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  // Sidebar
  sidebar_state: z.enum(['minimized', 'expanded', 'floating']).optional(),
  sidebar_position: z.enum(['left', 'right']).optional(),
  sidebar_pinned: z.boolean().optional(),
  // Visual Effects
  enable_animations: z.boolean().optional(),
  enable_focus_mode: z.boolean().optional(),
  enable_hover_effects: z.boolean().optional(),
  focus_mode_blur_level: z.number().min(0).max(10).optional(),
  // Display
  compact_mode: z.boolean().optional(),
  show_breadcrumbs: z.boolean().optional(),
  show_page_transitions: z.boolean().optional(),
  // Notifications
  enable_notifications: z.boolean().optional(),
  notification_sound: z.boolean().optional(),
  // Locale
  language: z.string().optional(),
  timezone: z.string().optional(),
  date_format: z.string().optional(),
});

export const logoutSessionSchema = z.object({
  session_id: z.string().uuid(),
});

export const updateSessionLimitSchema = z.object({
  max_sessions: z.number().int().min(1).max(10),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type LogoutSessionInput = z.infer<typeof logoutSessionSchema>;
export type UpdateSessionLimitInput = z.infer<typeof updateSessionLimitSchema>;
