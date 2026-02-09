/**
 * In-memory (and optional localStorage) store for access token.
 * Used by apiClient for Authorization header and by AuthContext for login/logout.
 */

const TOKEN_KEY = 'erp_access_token';

let memoryToken: string | null = null;

export function getAccessToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) memoryToken = stored;
    return stored;
  } catch {
    return null;
  }
}

export function setAccessToken(token: string, persist = false): void {
  memoryToken = token;
  if (persist) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // ignore
    }
  } else {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  }
}

export function clearAccessToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}
