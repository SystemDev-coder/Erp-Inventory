/**
 * Authentication Context
 * Manages user authentication state across the application
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService, User, LoginCredentials, RegisterData } from '../services/auth.service';
import { userService } from '../services/user.service';
import { ApiResponse } from '../services/api';
import { setAccessToken, clearAccessToken, getAccessToken } from '../services/authStore';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  permissions: string[];
  login: (credentials: LoginCredentials) => Promise<ApiResponse>;
  register: (data: RegisterData) => Promise<ApiResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUserState: (user: User | null) => void;
  lock: () => void;
  unlock: (password: string) => Promise<ApiResponse>;
  lockedInfo: { identifier: string; name?: string; hasLock?: boolean } | null;
  isLocked: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lockedInfo, setLockedInfo] = useState<{ identifier: string; name?: string; hasLock?: boolean } | null>(() => {
    const raw = localStorage.getItem('app_lock');
    return raw ? JSON.parse(raw) : null;
  });

  // Check if user is authenticated on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = getAccessToken();
      if (!token) {
        setUser(null);
        return;
      }
      if (lockedInfo) {
        // Keep user data minimal while locked
        const response = await authService.getCurrentUser();
        if (response.success && response.data) setUser(response.data.user);
        setIsLoading(false);
        return;
      }
      const response = await authService.getCurrentUser();
      if (response.success && response.data) {
        setUser(response.data.user);
        const permsRes = await userService.getPermissions();
        setPermissions(permsRes.success && permsRes.data?.permissions ? permsRes.data.permissions : []);
      } else {
        setUser(null);
        setPermissions([]);
      }
    } catch (error) {
      setUser(null);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials): Promise<ApiResponse> => {
    const response = await authService.login(credentials);

    if (response.success && response.data) {
      setAccessToken(response.data.accessToken, !!credentials.rememberMe);
      setUser(response.data.user);
      const permsRes = await userService.getPermissions();
      setPermissions(permsRes.success && permsRes.data?.permissions ? permsRes.data.permissions : []);
    }

    return response;
  };

  const register = async (data: RegisterData): Promise<ApiResponse> => {
    const response = await authService.register(data);

    if (response.success && response.data) {
      setAccessToken(response.data.accessToken, false);
      setUser(response.data.user);
      const permsRes = await userService.getPermissions();
      setPermissions(permsRes.success && permsRes.data?.permissions ? permsRes.data.permissions : []);
    }

    return response;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAccessToken();
      setUser(null);
      setPermissions([]);
      setLockedInfo(null);
      localStorage.removeItem('app_lock');
    }
  };

  const refreshUser = async () => {
    await checkAuth();
  };

  const lock = () => {
    if (!user) return;
    const raw = localStorage.getItem('app_lock');
    const existing = raw ? JSON.parse(raw) : {};
    const payload = { identifier: user.username, name: user.name, hasLock: existing.hasLock ?? true };
    localStorage.setItem('app_lock', JSON.stringify(payload));
    setLockedInfo(payload);
  };

  const unlock = async (password: string): Promise<ApiResponse> => {
    if (!lockedInfo) return { success: false, error: 'Not locked' } as any;

    const response = await authService.verifyLockPassword(password);
    if (response.success) {
      localStorage.removeItem('app_lock');
      setLockedInfo(null);
      await refreshUser();
    }
    return response;
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    permissions,
    login,
    register,
    logout,
    refreshUser,
    setUserState: setUser,
    lock,
    unlock,
    lockedInfo,
    isLocked: !!lockedInfo,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use authentication context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
