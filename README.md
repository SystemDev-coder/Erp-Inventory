# Full-Stack Application - Frontend & Backend Integration

This project consists of a React frontend and an Express backend API with PostgreSQL database.

## Project Structure

```
Task/
├── frontend/          # React + Vite + TypeScript frontend
├── server/           # Express + TypeScript backend API
└── sql/              # Database schema and migrations
```

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Git

## Quick Start

### 1. Backend Setup

#### Install Dependencies

```bash
cd server
npm install
```

#### Configure Environment

Create a `.env` file in the `server` directory:

```bash
cp .env.example .env
```

Edit `.env` and configure your settings:

```env
# Environment
NODE_ENV=development
PORT=5000

# PostgreSQL Database
PGHOST=localhost
PGPORT=5432
PGDATABASE=your_database_name
PGUSER=your_database_user
PGPASSWORD=your_database_password
PGSCHEMA=ims

# Frontend URL
CLIENT_ORIGIN=http://localhost:5173

# JWT Secrets (generate strong random strings)
JWT_ACCESS_SECRET=your_access_secret_min_32_characters_long
JWT_REFRESH_SECRET=your_refresh_secret_min_32_characters_long
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7

# Cookie Configuration
COOKIE_NAME=rt
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

# Password Reset
RESET_CODE_EXPIRES_MIN=10
DEV_RETURN_RESET_CODE=true
```

#### Setup Database

Run the SQL schema files to set up your database:

```bash
# Connect to PostgreSQL and run the schema files
psql -U your_user -d your_database -f sql/COMPLETE_SETUP.sql
```

#### Start Backend Server

```bash
npm run dev
```

The backend API will be available at `http://localhost:5000`

### 2. Frontend Setup

#### Install Dependencies

```bash
cd frontend
npm install
```

#### Configure Environment

The `.env` file has already been created with default values:

```env
VITE_API_URL=http://localhost:5000
VITE_ENV=development
```

If you need to change the backend URL, edit the `.env` file.

#### Start Frontend Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

## API Integration

### Architecture

The frontend and backend communicate through a REST API with the following features:

- **Authentication**: JWT-based authentication with refresh tokens stored in HTTP-only cookies
- **CORS**: Configured to allow requests from the frontend origin
- **Credentials**: Cookies are automatically sent with requests using `credentials: 'include'`
- **Proxy**: Vite development server proxies `/api` requests to the backend

### API Services

The frontend includes several service modules:

#### Auth Service (`src/services/auth.service.ts`)
- User registration and login
- Token refresh
- Password reset
- Current user profile

#### User Service (`src/services/user.service.ts`)
- User permissions
- Preferences management
- Session management
- Sidebar configuration

#### System Service (`src/services/system.service.ts`)
- Role management
- User management
- Permission management
- Audit logs

### Using the API Client

```typescript
import { apiClient } from './services/api';

// GET request
const response = await apiClient.get('/api/endpoint');

// POST request
const response = await apiClient.post('/api/endpoint', { data });

// PUT request
const response = await apiClient.put('/api/endpoint', { data });

// DELETE request
const response = await apiClient.delete('/api/endpoint');
```

### Using Auth Context

```typescript
import { useAuth } from './context/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, login, logout } = useAuth();

  const handleLogin = async () => {
    const response = await login({
      username: 'user',
      password: 'pass',
    });
    
    if (response.success) {
      // Login successful
    }
  };

  return <div>{isAuthenticated ? user.username : 'Not logged in'}</div>;
}
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### User Management
- `GET /api/user/permissions` - Get user permissions
- `GET /api/user/sidebar` - Get sidebar configuration
- `GET /api/user/preferences` - Get user preferences
- `PUT /api/user/preferences` - Update user preferences
- `GET /api/user/sessions` - Get active sessions
- `POST /api/user/logout-other-sessions` - Logout other sessions
- `DELETE /api/user/sessions/:id` - Logout specific session

### System Administration
- `GET /api/system/permissions` - Get all permissions
- `GET /api/system/roles` - Get all roles
- `POST /api/system/roles` - Create role
- `PUT /api/system/roles/:id` - Update role
- `GET /api/system/users` - Get all users
- `PUT /api/system/users/:id` - Update user

## Testing the Integration

### 1. Test Backend Health

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "success": true,
  "message": "Server is healthy",
  "timestamp": "2026-02-08T..."
}
```

### 2. Test User Registration

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "first_name": "Test",
    "last_name": "User"
  }'
```

### 3. Test Frontend Login

1. Open `http://localhost:5173/signin`
2. Enter your credentials
3. Click "Sign in"
4. You should be redirected to the dashboard upon successful login

### 4. Test API Communication

Open browser DevTools (F12) and check:
- **Network tab**: See API requests to `/api/*` endpoints
- **Console**: Check for any errors
- **Application > Cookies**: Verify refresh token cookie is set

## Development Workflow

### Running Both Services

You can run both frontend and backend simultaneously:

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Hot Reload

Both services support hot reload:
- **Frontend**: Vite automatically reloads on file changes
- **Backend**: Nodemon restarts the server on file changes

## Building for Production

### Backend

```bash
cd server
npm run build
npm start
```

### Frontend

```bash
cd frontend
npm run build
```

The built files will be in `frontend/dist/`. Serve these with a static file server or integrate with your backend.

## Troubleshooting

### CORS Errors

If you see CORS errors:
1. Check that `CLIENT_ORIGIN` in backend `.env` matches your frontend URL
2. Verify the backend CORS configuration in `server/src/config/cors.ts`
3. Ensure credentials are included in frontend requests

### Authentication Issues

If login doesn't work:
1. Check that cookies are enabled in your browser
2. Verify JWT secrets are set in backend `.env`
3. Check browser DevTools > Application > Cookies for the refresh token
4. Ensure the database is properly set up with the auth schema

### Connection Refused

If the frontend can't connect to the backend:
1. Verify the backend is running on port 5000
2. Check the `VITE_API_URL` in frontend `.env`
3. Verify the Vite proxy configuration in `vite.config.ts`

### Database Connection Errors

If the backend can't connect to the database:
1. Verify PostgreSQL is running
2. Check database credentials in backend `.env`
3. Ensure the database and schema exist
4. Run the SQL setup scripts

## Environment Variables Reference

### Backend (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `5000` |
| `PGHOST` | PostgreSQL host | `localhost` |
| `PGPORT` | PostgreSQL port | `5432` |
| `PGDATABASE` | Database name | Required |
| `PGUSER` | Database user | Required |
| `PGPASSWORD` | Database password | Required |
| `CLIENT_ORIGIN` | Frontend URL | `http://localhost:5173` |
| `JWT_ACCESS_SECRET` | JWT access token secret | Required (32+ chars) |
| `JWT_REFRESH_SECRET` | JWT refresh token secret | Required (32+ chars) |

### Frontend (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:5000` |
| `VITE_ENV` | Environment mode | `development` |

## Security Notes

- Never commit `.env` files to version control
- Use strong, random secrets for JWT tokens (32+ characters)
- In production, set `COOKIE_SECURE=true` to require HTTPS
- Keep dependencies updated regularly
- Use environment-specific configurations for development/production

## License

[Your License Here]
