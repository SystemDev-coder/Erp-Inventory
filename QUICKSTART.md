# Quick Start Guide

Get the application running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- PostgreSQL 14+ installed and running
- Git installed

## Step-by-Step Setup

### 1. Database Setup (2 minutes)

```bash
# Create database
createdb erp_inventory

# Or using psql
psql -U postgres
CREATE DATABASE erp_inventory;
\q

# Run schema setup
cd sql
psql -U postgres -d erp_inventory -f COMPLETE_SETUP.sql
```

### 2. Backend Setup (1 minute)

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your database credentials
# At minimum, update:
# - PGDATABASE=erp_inventory
# - PGUSER=your_postgres_user
# - PGPASSWORD=your_postgres_password
# - JWT_ACCESS_SECRET=change-this-to-random-string-32-chars
# - JWT_REFRESH_SECRET=change-this-to-another-random-string

# Start server
npm run dev
```

Server should start at `http://localhost:5000`

### 3. Frontend Setup (1 minute)

```bash
# Open new terminal
cd frontend

# Install dependencies
npm install

# Environment is already configured (.env exists)

# Start dev server
npm run dev
```

Frontend should start at `http://localhost:5173`

### 4. Test the Application (1 minute)

#### A. Test Backend
Open browser to: `http://localhost:5000/api/health`

Should see:
```json
{
  "success": true,
  "message": "Server is healthy"
}
```

#### B. Create Account
1. Open `http://localhost:5173/signup`
2. Fill in form:
   - First Name: Test
   - Last Name: User
   - Username: testuser
   - Email: test@example.com
   - Password: Test123!
3. Check "I agree to terms"
4. Click "Sign Up"
5. You should be redirected to the dashboard!

#### C. Test Login
1. Logout (if logged in)
2. Go to `http://localhost:5173/signin`
3. Enter credentials:
   - Username: testuser
   - Password: Test123!
4. Click "Sign in"
5. You should be redirected to the dashboard!

## Troubleshooting

### Backend won't start

**Error: "Database connection failed"**
- Check PostgreSQL is running: `pg_isready`
- Verify credentials in `server/.env`
- Check database exists: `psql -l`

**Error: "JWT secrets required"**
- Make sure JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are set in `.env`
- They must be at least 32 characters

**Error: "Port 5000 already in use"**
- Change PORT in `server/.env` to another port (e.g., 5001)
- Update `VITE_API_URL` in `frontend/.env` to match

### Frontend won't start

**Error: "Port 5173 already in use"**
- Kill the process using port 5173
- Or change port in `frontend/vite.config.ts`

**Error: "Cannot connect to backend"**
- Verify backend is running on port 5000
- Check `VITE_API_URL` in `frontend/.env`

### Login doesn't work

**Cookies not being set**
- Check browser doesn't block cookies
- Verify `CLIENT_ORIGIN` in `server/.env` matches frontend URL exactly
- Clear browser cookies and try again

**401 Unauthorized**
- Clear cookies
- Restart backend server
- Try registering a new user

## Next Steps

Once everything is running:

1. Read [README.md](./README.md) for detailed documentation
2. Check [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) to understand the architecture
3. See [TESTING.md](./TESTING.md) for comprehensive testing guide

## Generate Strong JWT Secrets

You can generate secure random strings for JWT secrets:

**Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Using OpenSSL:**
```bash
openssl rand -hex 32
```

**Using PowerShell:**
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

Copy the output and use it for JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.

## Default Commands

### Start Both Servers

**Terminal 1 (Backend):**
```bash
cd server && npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd frontend && npm run dev
```

### Stop Servers

Press `Ctrl+C` in each terminal

## Quick Test Commands

```bash
# Test backend health
curl http://localhost:5000/api/health

# Test registration
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@test.com","password":"test123","first_name":"Test","last_name":"User"}'

# Test login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'
```

## Support

If you encounter issues:
1. Check the error message carefully
2. Verify all environment variables are set
3. Ensure PostgreSQL is running
4. Check the port isn't already in use
5. Review logs in the terminal

For detailed troubleshooting, see [TESTING.md](./TESTING.md#9-common-issues-and-solutions)
