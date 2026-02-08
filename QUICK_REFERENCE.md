# Quick Reference Card

## Start Servers

```bash
# Backend (Terminal 1)
cd server && npm run dev

# Frontend (Terminal 2)
cd frontend && npm run dev
```

## URLs

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- Health Check: `http://localhost:5000/api/health`

## Environment Variables

### Backend (.env)
```env
NODE_ENV=development
PORT=5000
PGHOST=localhost
PGDATABASE=your_db
PGUSER=your_user
PGPASSWORD=your_pass
CLIENT_ORIGIN=http://localhost:5173
JWT_ACCESS_SECRET=min-32-chars
JWT_REFRESH_SECRET=min-32-chars
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000
VITE_ENV=development
```

## Auth Context Hook

```typescript
import { useAuth } from '@/context/AuthContext';

const {
  user,              // User object or null
  isAuthenticated,   // boolean
  isLoading,         // boolean
  login,             // (credentials) => Promise
  register,          // (data) => Promise
  logout,            // () => Promise
  refreshUser,       // () => Promise
} = useAuth();
```

## Service Methods

### Auth Service
```typescript
import { authService } from '@/services/auth.service';

authService.register({ username, email, password })
authService.login({ username, password })
authService.logout()
authService.getCurrentUser()
authService.refreshToken()
authService.forgotPassword({ email })
authService.resetPassword({ token, newPassword })
```

### User Service
```typescript
import { userService } from '@/services/user.service';

userService.getPermissions()
userService.getSidebar()
userService.getPreferences()
userService.updatePreferences(data)
userService.getSessions()
userService.logoutOtherSessions()
```

### System Service
```typescript
import { systemService } from '@/services/system.service';

systemService.getPermissions()
systemService.getRoles()
systemService.getUsers()
systemService.createRole(data)
systemService.updateUserAccess(id, data)
```

## API Client

```typescript
import { apiClient } from '@/services/api';

apiClient.get('/api/endpoint')
apiClient.post('/api/endpoint', data)
apiClient.put('/api/endpoint', data)
apiClient.delete('/api/endpoint')
```

## API Endpoints

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/refresh`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

### User
- `GET /api/user/permissions`
- `GET /api/user/sidebar`
- `GET /api/user/preferences`
- `PUT /api/user/preferences`
- `GET /api/user/sessions`
- `POST /api/user/logout-other-sessions`
- `DELETE /api/user/sessions/:id`

### System
- `GET /api/system/permissions`
- `GET /api/system/roles`
- `POST /api/system/roles`
- `PUT /api/system/roles/:id`
- `GET /api/system/users`
- `PUT /api/system/users/:id`

## Testing Commands

```bash
# Health check
curl http://localhost:5000/api/health

# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@test.com","password":"test123"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"username":"test","password":"test123"}'

# Get current user (with cookie)
curl http://localhost:5000/api/auth/me -b cookies.txt
```

## Browser Console Tests

```javascript
// Health check
fetch('/api/health').then(r => r.json()).then(console.log)

// Check environment
console.log(import.meta.env.VITE_API_URL)

// API health check utility
await checkApiHealth()
await logHealthCheck()
```

## Protected Route Example

```typescript
import { useAuth } from '@/context/AuthContext';
import { Navigate } from 'react-router';

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/signin" />;
  
  return <>{children}</>;
}
```

## Component Example

```typescript
import { useAuth } from '@/context/AuthContext';
import { userService } from '@/services/user.service';

function MyComponent() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  
  useEffect(() => {
    async function fetchData() {
      const response = await userService.getPermissions();
      if (response.success) {
        setData(response.data);
      }
    }
    fetchData();
  }, []);
  
  return (
    <div>
      <p>Welcome, {user?.username}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Error Handling

```typescript
const response = await apiClient.get('/api/endpoint');

if (response.success) {
  const data = response.data;
  // Use data
} else {
  console.error(response.error);
  alert(response.message);
}
```

## Common Issues

| Problem | Solution |
|---------|----------|
| CORS error | Check `CLIENT_ORIGIN` in backend `.env` |
| Cookie not set | Ensure `credentials: 'include'` in requests |
| 401 error | Verify JWT secrets, check login status |
| Connection refused | Check backend is running, verify port |
| Database error | Check PostgreSQL is running, verify credentials |

## File Locations

```
frontend/src/
├── config/env.ts              # API endpoints
├── services/
│   ├── api.ts                 # Base API client
│   ├── auth.service.ts        # Auth methods
│   ├── user.service.ts        # User methods
│   └── system.service.ts      # System methods
├── context/AuthContext.tsx    # Auth state
└── components/auth/
    ├── SignInForm.tsx         # Login form
    └── SignUpForm.tsx         # Register form
```

## Documentation

- **README.md** - Complete guide
- **QUICKSTART.md** - 5-minute setup
- **INTEGRATION_GUIDE.md** - Architecture details
- **TESTING.md** - Testing procedures
- **CONNECTION_VERIFIED.md** - Verification checklist
- **QUICK_REFERENCE.md** - This file

## Generate JWT Secrets

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL
openssl rand -hex 32

# PowerShell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

## Build for Production

```bash
# Frontend
cd frontend
npm run build
# Output: dist/

# Backend
cd server
npm run build
npm start
# Output: dist/
```

## Key Features

✅ JWT authentication with refresh tokens
✅ HTTP-only cookies for security
✅ Automatic token refresh
✅ CORS configured
✅ Type-safe API calls
✅ Centralized error handling
✅ Global auth state
✅ Protected routes

## Support

For detailed information, see:
- Setup: README.md
- Architecture: INTEGRATION_GUIDE.md
- Testing: TESTING.md
- Troubleshooting: TESTING.md section 9
