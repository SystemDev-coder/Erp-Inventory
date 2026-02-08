-- ============================================
-- SESSION MANAGEMENT & USER PREFERENCES
-- Run this in pgAdmin after seed_permissions.sql
-- SAFE TO RUN MULTIPLE TIMES (IDEMPOTENT)
-- ============================================

-- User Sessions Table
CREATE TABLE IF NOT EXISTS ims.user_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INT NOT NULL REFERENCES ims.users(user_id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    device_type VARCHAR(50), -- mobile, desktop, tablet
    browser VARCHAR(100),
    os VARCHAR(100),
    location VARCHAR(200), -- City, Country (if using GeoIP)
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, refresh_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON ims.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON ims.user_sessions(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON ims.user_sessions(last_activity DESC);

-- User Preferences Table
CREATE TABLE IF NOT EXISTS ims.user_preferences (
    user_id INT PRIMARY KEY REFERENCES ims.users(user_id) ON DELETE CASCADE,
    
    -- Theme Settings
    theme VARCHAR(20) DEFAULT 'light', -- light, dark, auto
    accent_color VARCHAR(7) DEFAULT '#3b82f6', -- hex color
    
    -- Sidebar Settings
    sidebar_state VARCHAR(20) DEFAULT 'expanded', -- minimized, expanded, floating
    sidebar_position VARCHAR(10) DEFAULT 'left', -- left, right
    sidebar_pinned BOOLEAN DEFAULT TRUE,
    
    -- Visual Effects
    enable_animations BOOLEAN DEFAULT TRUE,
    enable_focus_mode BOOLEAN DEFAULT FALSE,
    enable_hover_effects BOOLEAN DEFAULT TRUE,
    focus_mode_blur_level INT DEFAULT 5, -- 0-10
    
    -- Display Settings
    compact_mode BOOLEAN DEFAULT FALSE,
    show_breadcrumbs BOOLEAN DEFAULT TRUE,
    show_page_transitions BOOLEAN DEFAULT TRUE,
    
    -- Notification Settings
    enable_notifications BOOLEAN DEFAULT TRUE,
    notification_sound BOOLEAN DEFAULT FALSE,
    
    -- Language & Locale
    language VARCHAR(10) DEFAULT 'en', -- en, so
    timezone VARCHAR(50) DEFAULT 'UTC',
    date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
    
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Concurrent Session Limits Table
CREATE TABLE IF NOT EXISTS ims.concurrent_session_limits (
    user_id INT PRIMARY KEY REFERENCES ims.users(user_id) ON DELETE CASCADE,
    max_sessions INT DEFAULT 2, -- Default limit: 2 concurrent sessions
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sidebar Menu Cache Table
CREATE TABLE IF NOT EXISTS ims.sidebar_menu_cache (
    cache_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES ims.users(user_id) ON DELETE CASCADE,
    role_id INT REFERENCES ims.roles(role_id) ON DELETE CASCADE,
    menu_data JSONB NOT NULL,
    permissions_hash VARCHAR(64) NOT NULL, -- Hash of permission keys for cache invalidation
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_sidebar_cache_user ON ims.sidebar_menu_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_sidebar_cache_role ON ims.sidebar_menu_cache(role_id);
CREATE INDEX IF NOT EXISTS idx_sidebar_cache_expires ON ims.sidebar_menu_cache(expires_at);

-- Permission Cache Table (for performance)
CREATE TABLE IF NOT EXISTS ims.permission_cache (
    user_id INT PRIMARY KEY REFERENCES ims.users(user_id) ON DELETE CASCADE,
    permissions JSONB NOT NULL, -- Array of permission keys
    permissions_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permission_cache_expires ON ims.permission_cache(expires_at);

-- Session Activity Log (for security tracking)
CREATE TABLE IF NOT EXISTS ims.session_activity_log (
    log_id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES ims.user_sessions(session_id) ON DELETE CASCADE,
    user_id INT REFERENCES ims.users(user_id) ON DELETE SET NULL,
    activity_type VARCHAR(50) NOT NULL, -- login, logout, refresh, api_call
    endpoint VARCHAR(255),
    ip_address VARCHAR(50),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_activity_user ON ims.session_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_activity_session ON ims.session_activity_log(session_id, created_at DESC);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to clean expired sessions
CREATE OR REPLACE FUNCTION clean_expired_sessions() RETURNS void AS $$
BEGIN
    DELETE FROM ims.user_sessions 
    WHERE expires_at < NOW() OR (is_active = FALSE AND last_activity < NOW() - INTERVAL '7 days');
    
    DELETE FROM ims.sidebar_menu_cache WHERE expires_at < NOW();
    DELETE FROM ims.permission_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get active session count for user
CREATE OR REPLACE FUNCTION get_active_session_count(p_user_id INT) RETURNS INT AS $$
BEGIN
    RETURN (
        SELECT COUNT(*) 
        FROM ims.user_sessions 
        WHERE user_id = p_user_id 
        AND is_active = TRUE 
        AND expires_at > NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- Function to invalidate permission cache for user
CREATE OR REPLACE FUNCTION invalidate_permission_cache(p_user_id INT) RETURNS void AS $$
BEGIN
    DELETE FROM ims.permission_cache WHERE user_id = p_user_id;
    DELETE FROM ims.sidebar_menu_cache WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to invalidate cache when permissions change
CREATE OR REPLACE FUNCTION trigger_invalidate_cache() RETURNS TRIGGER AS $$
BEGIN
    -- Invalidate for specific user if user_permissions changed
    IF TG_TABLE_NAME = 'user_permissions' OR TG_TABLE_NAME = 'user_permission_overrides' THEN
        PERFORM invalidate_permission_cache(NEW.user_id);
    END IF;
    
    -- Invalidate for all users with this role if role_permissions changed
    IF TG_TABLE_NAME = 'role_permissions' THEN
        DELETE FROM ims.permission_cache 
        WHERE user_id IN (SELECT user_id FROM ims.users WHERE role_id = NEW.role_id);
        
        DELETE FROM ims.sidebar_menu_cache 
        WHERE role_id = NEW.role_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for cache invalidation
DROP TRIGGER IF EXISTS trg_invalidate_user_perms ON ims.user_permissions;
CREATE TRIGGER trg_invalidate_user_perms
AFTER INSERT OR UPDATE OR DELETE ON ims.user_permissions
FOR EACH ROW EXECUTE FUNCTION trigger_invalidate_cache();

DROP TRIGGER IF EXISTS trg_invalidate_user_overrides ON ims.user_permission_overrides;
CREATE TRIGGER trg_invalidate_user_overrides
AFTER INSERT OR UPDATE OR DELETE ON ims.user_permission_overrides
FOR EACH ROW EXECUTE FUNCTION trigger_invalidate_cache();

DROP TRIGGER IF EXISTS trg_invalidate_role_perms ON ims.role_permissions;
CREATE TRIGGER trg_invalidate_role_perms
AFTER INSERT OR UPDATE OR DELETE ON ims.role_permissions
FOR EACH ROW EXECUTE FUNCTION trigger_invalidate_cache();

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Set default concurrent session limits for all existing users
INSERT INTO ims.concurrent_session_limits (user_id, max_sessions)
SELECT user_id, 2 FROM ims.users
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- MAINTENANCE VIEWS
-- ============================================

-- View for active sessions summary
CREATE OR REPLACE VIEW ims.v_active_sessions AS
SELECT 
    s.session_id,
    s.user_id,
    u.username,
    u.name,
    s.ip_address,
    s.device_type,
    s.browser,
    s.last_activity,
    s.expires_at,
    s.created_at,
    EXTRACT(EPOCH FROM (NOW() - s.last_activity)) / 60 AS idle_minutes
FROM ims.user_sessions s
JOIN ims.users u ON s.user_id = u.user_id
WHERE s.is_active = TRUE AND s.expires_at > NOW()
ORDER BY s.last_activity DESC;

-- View for session statistics per user
CREATE OR REPLACE VIEW ims.v_user_session_stats AS
SELECT 
    u.user_id,
    u.username,
    u.name,
    COUNT(s.session_id) AS active_sessions,
    MAX(s.last_activity) AS last_seen,
    COALESCE(csl.max_sessions, 2) AS session_limit
FROM ims.users u
LEFT JOIN ims.user_sessions s ON u.user_id = s.user_id AND s.is_active = TRUE AND s.expires_at > NOW()
LEFT JOIN ims.concurrent_session_limits csl ON u.user_id = csl.user_id
GROUP BY u.user_id, u.username, u.name, csl.max_sessions;

-- Verify installation
SELECT 'Session management tables created successfully!' as status;
SELECT COUNT(*) as user_sessions_count FROM ims.user_sessions;
SELECT COUNT(*) as preferences_count FROM ims.user_preferences;
SELECT COUNT(*) as session_limits_count FROM ims.concurrent_session_limits;
