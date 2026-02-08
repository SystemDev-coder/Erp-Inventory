# Frontend-Backend Integration Guide

This document explains how the frontend and backend are connected and how to work with the integration.

## Overview

The application uses a modern client-server architecture:

- **Frontend**: React SPA with TypeScript, Vite, and Tailwind CSS
- **Backend**: RESTful API with Express, TypeScript, and PostgreSQL
- **Authentication**: JWT tokens with HTTP-only refresh token cookies
- **Communication**: Fetch API with centralized error handling

## Connection Flow

### 1. Initial Page Load

```
User → Frontend (Vite Dev Server :5173)
     → AuthContext checks authentication
     → GET /api/auth/me
     → Backend (:5000)
     → Response with user data or 401
```

### 2. User Login

```
User enters credentials
     → SignInForm
     → useAuth().login()
     → POST /api/auth/login
     → Backend validates credentials
     → Sets refresh token cookie (HTTP-only)
     → Returns access token + user data
     → AuthContext updates state
     → User redirected to dashboard
```

### 3. Authenticated API Requests

```
Component needs data
     → Calls service method (e.g., userService.getPermissions())
     → apiClient.get('/api/user/permissions')
     → Request includes credentials (cookies)
     → Backend validates JWT
     → Returns data
     → Component updates UI
```

### 4. Token Refresh

```
Access token expires (15 minutes)
     → API request returns 401
     → Frontend calls authService.refreshToken()
     → POST /api/auth/refresh (with cookie)
     → Backend validates refresh token
     → Returns new access token
     → Original request retried
```

## Key Components

### Frontend Architecture

```
src/
├── config/
│   └── env.ts                 # Environment config & API endpoints
├── services/
│   ├── api.ts                 # Base API client with fetch wrapper
│   ├── auth.service.ts        # Authentication methods
│   ├── user.service.ts        # User-related methods
│   └── system.service.ts      # System admin methods
├── context/
│   └── AuthContext.tsx        # Global auth state management
└── components/
    └── auth/
        ├── SignInForm.tsx     # Login form
        └── SignUpForm.tsx     # Registration form
```

### Backend Architecture

```
server/src/
├── config/
│   ├── env.ts                 # Environment validation
│   ├── cors.ts                # CORS configuration
│   └── cookie.ts              # Cookie settings
├── modules/
│   ├── auth/                  # Authentication module
│   ├── session/               # Session & user management
│   └── system/                # System administration
├── middlewares/
│   ├── requireAuth.ts         # JWT validation
│   └── errorHandler.ts        # Error handling
└── app.ts                     # Express app setup
```

## API Client Usage

### Basic Usage

```typescript
import { apiClient } from '@/services/api';

// GET request
const response = await apiClient.get('/api/users');

// POST request
const response = await apiClient.post('/api/users', {
  username: 'john',
  email: 'john@example.com',
});

// PUT request
const response = await apiClient.put('/api/users/123', {
  first_name: 'John',
});

// DELETE request
const response = await apiClient.delete('/api/users/123');
```

### Response Handling

All API responses follow this structure:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
```

Example:

```typescript
const response = await apiClient.get('/api/user/permissions');

if (response.success) {
  const permissions = response.data.permissions;
  // Use permissions
} else {
  console.error(response.error);
  // Show error message
}
```

### Error Handling

The API client automatically handles:
- Network errors
- HTTP errors (400, 401, 403, 404, 500, etc.)
- JSON parsing errors

Errors are returned in the response object, not thrown:

```typescript
const response = await apiClient.post('/api/auth/login', credentials);

if (!response.success) {
  // Error object is in the response
  alert(response.error); // "Invalid credentials"
}
```

## Authentication Flow

### Using the Auth Context

```typescript
import { useAuth } from '@/context/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }

  return (
    <div>
      <p>Welcome, {user.username}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Login Example

```typescript
const { login } = useAuth();

const handleLogin = async (e: FormEvent) => {
  e.preventDefault();
  
  const response = await login({
    username: 'myuser',
    password: 'mypassword',
    rememberMe: true,
  });
  
  if (response.success) {
    navigate('/dashboard');
  } else {
    setError(response.error);
  }
};
```

### Registration Example

```typescript
const { register } = useAuth();

const handleRegister = async (e: FormEvent) => {
  e.preventDefault();
  
  const response = await register({
    username: 'newuser',
    email: 'user@example.com',
    password: 'securepass',
    first_name: 'John',
    last_name: 'Doe',
  });
  
  if (response.success) {
    navigate('/dashboard');
  } else {
    setError(response.error);
  }
};
```

## Protected Routes

To protect routes that require authentication:

```typescript
import { useAuth } from '@/context/AuthContext';
import { Navigate } from 'react-router';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  return <>{children}</>;
}

// Usage in router
<Route path="/dashboard" element={
  <ProtectedRoute>
    <Dashboard />
  </ProtectedRoute>
} />
```

## Service Methods

### Auth Service

```typescript
import { authService } from '@/services/auth.service';

// Register
await authService.register({
  username: 'user',
  email: 'user@example.com',
  password: 'pass',
});

// Login
await authService.login({
  username: 'user',
  password: 'pass',
});

// Get current user
await authService.getCurrentUser();

// Logout
await authService.logout();

// Refresh token
await authService.refreshToken();

// Password reset
await authService.forgotPassword({ email: 'user@example.com' });
await authService.resetPassword({ token: 'reset-token', newPassword: 'newpass' });
```

### User Service

```typescript
import { userService } from '@/services/user.service';

// Get permissions
await userService.getPermissions();

// Get sidebar
await userService.getSidebar();

// Check permission
await userService.checkPermission('users.create');

// Get/Update preferences
await userService.getPreferences();
await userService.updatePreferences({ theme: 'dark' });

// Session management
await userService.getSessions();
await userService.logoutOtherSessions();
await userService.logoutSession('session-id');
```

### System Service

```typescript
import { systemService } from '@/services/system.service';

// Permissions
await systemService.getPermissions();

// Roles
await systemService.getRoles();
await systemService.createRole({ role_name: 'Manager' });
await systemService.updateRole(1, { role_name: 'Senior Manager' });
await systemService.getRolePermissions(1);
await systemService.updateRolePermissions(1, [1, 2, 3]);

// Users
await systemService.getUsers();
await systemService.updateUserAccess(1, { role_id: 2, is_active: true });
await systemService.getUserPermissions(1);
await systemService.updateUserPermissions(1, [1, 2, 3]);
await systemService.getUserOverrides(1);
await systemService.getUserAuditLogs(1);
```

## Configuration

### Frontend Environment Variables

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_ENV=development
```

Access in code:

```typescript
import { env, API } from '@/config/env';

console.log(env.API_URL);        // http://localhost:5000
console.log(API.AUTH.LOGIN);      // /api/auth/login
```

### Vite Proxy Configuration

The Vite config proxies API requests:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
```

This means requests to `/api/*` are automatically forwarded to the backend.

### Backend CORS Configuration

The backend allows requests from the frontend:

```typescript
// server/src/config/cors.ts
export const corsOptions = {
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
};
```

## Best Practices

### 1. Always Use Service Methods

❌ **Don't:**
```typescript
const response = await fetch('http://localhost:5000/api/users');
```

✅ **Do:**
```typescript
const response = await apiClient.get('/api/users');
```

### 2. Handle Errors Gracefully

```typescript
const response = await userService.getPermissions();

if (!response.success) {
  // Show user-friendly error
  toast.error(response.error || 'Failed to load permissions');
  return;
}

const permissions = response.data.permissions;
```

### 3. Use TypeScript Types

```typescript
import { User, Permission } from '@/services/auth.service';

const user: User = response.data.user;
const permissions: Permission[] = response.data.permissions;
```

### 4. Leverage Auth Context

Don't check authentication manually. Use the context:

```typescript
const { isAuthenticated, user } = useAuth();

if (!isAuthenticated) {
  return <Navigate to="/signin" />;
}
```

### 5. Keep API Logic in Services

Don't make API calls directly in components. Use or extend service classes:

```typescript
// ✅ Good
const response = await userService.getPreferences();

// ❌ Bad
const response = await fetch('/api/user/preferences');
```

## Testing

### Test Backend API

```bash
# Health check
curl http://localhost:5000/api/health

# Register user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@test.com","password":"test123"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"username":"test","password":"test123"}'

# Get current user (with cookie)
curl http://localhost:5000/api/auth/me \
  -b cookies.txt
```

### Test Frontend

1. Open DevTools (F12)
2. Go to Network tab
3. Perform login
4. Check requests:
   - Request to `/api/auth/login`
   - Status 200
   - Response includes user data
5. Go to Application > Cookies
   - Check for `rt` cookie (refresh token)

## Troubleshooting

### Problem: CORS errors

**Solution:**
- Check `CLIENT_ORIGIN` in backend `.env`
- Verify it matches your frontend URL exactly
- Restart backend after changing `.env`

### Problem: Cookies not set

**Solution:**
- Ensure backend sends `Set-Cookie` header
- Check that frontend uses `credentials: 'include'`
- Verify cookie settings in backend config
- Check browser doesn't block third-party cookies

### Problem: 401 Unauthorized

**Solution:**
- Check JWT secrets are set in backend `.env`
- Verify token hasn't expired
- Check Authorization header is sent
- Ensure user is logged in

### Problem: Network error

**Solution:**
- Verify backend is running on port 5000
- Check `VITE_API_URL` in frontend `.env`
- Verify Vite proxy is configured
- Check firewall settings

## Additional Resources

- [Express Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [JWT Introduction](https://jwt.io/introduction)
