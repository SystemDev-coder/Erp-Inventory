# Testing Frontend-Backend Integration

This guide helps you verify that the frontend and backend are communicating correctly.

## Pre-Testing Checklist

Before testing, ensure:

- [ ] PostgreSQL is running
- [ ] Database schema is set up
- [ ] Backend `.env` is configured
- [ ] Frontend `.env` is configured
- [ ] Backend server is running on port 5000
- [ ] Frontend dev server is running on port 5173

## 1. Backend Health Check

### Test 1: API Health Endpoint

**Using cURL:**
```bash
curl http://localhost:5000/api/health
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Server is healthy",
  "timestamp": "2026-02-08T..."
}
```

**Using Browser:**
Open `http://localhost:5000/api/health` in your browser.

### Test 2: CORS Headers

```bash
curl -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     http://localhost:5000/api/auth/login \
     -v
```

**Expected:** Should see CORS headers in response:
- `Access-Control-Allow-Origin: http://localhost:5173`
- `Access-Control-Allow-Credentials: true`

## 2. User Registration

### Test 3: Register a New User

**Using cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "Test123!",
    "first_name": "Test",
    "last_name": "User"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "user_id": 1,
      "username": "testuser",
      "email": "test@example.com",
      "first_name": "Test",
      "last_name": "User",
      "is_active": true,
      "role_id": 2,
      "role_name": "User"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Using Frontend:**
1. Open `http://localhost:5173/signup`
2. Fill in the form:
   - First Name: Test
   - Last Name: User
   - Username: testuser
   - Email: test@example.com
   - Password: Test123!
   - Check "I agree to terms"
3. Click "Sign Up"
4. Expected: Redirect to dashboard

**Check Browser DevTools:**
- Network tab: Should see POST to `/api/auth/register` with status 200
- Application > Cookies: Should see `rt` cookie set
- Console: No errors

## 3. User Login

### Test 4: Login with Credentials

**Using cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "username": "testuser",
    "password": "Test123!"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Login successful"
}
```

Cookie file (`cookies.txt`) should contain the refresh token.

**Using Frontend:**
1. Open `http://localhost:5173/signin`
2. Enter credentials:
   - Username: testuser
   - Password: Test123!
3. Click "Sign in"
4. Expected: Redirect to dashboard

**Check Browser DevTools:**
- Network tab: POST to `/api/auth/login` with status 200
- Response includes user data and accessToken
- Application > Cookies: `rt` cookie is set with HTTPOnly flag
- Console: No errors

### Test 5: Login with Wrong Credentials

**Using Frontend:**
1. Open `http://localhost:5173/signin`
2. Enter wrong password
3. Click "Sign in"
4. Expected: Error message "Invalid credentials" displayed

## 4. Authenticated Requests

### Test 6: Get Current User

**Using cURL (with cookie from login):**
```bash
curl http://localhost:5000/api/auth/me \
  -b cookies.txt
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "user_id": 1,
      "username": "testuser",
      "email": "test@example.com",
      ...
    }
  }
}
```

**Using Frontend:**
After login, the dashboard should show your username and profile info.

### Test 7: Get User Permissions

**Using cURL:**
```bash
curl http://localhost:5000/api/user/permissions \
  -b cookies.txt
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "permissions": [
      {
        "perm_id": 1,
        "perm_key": "dashboard.view",
        "perm_name": "View Dashboard",
        "description": "..."
      },
      ...
    ]
  }
}
```

### Test 8: Unauthorized Access

**Using cURL (without cookie):**
```bash
curl http://localhost:5000/api/user/permissions
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

Status code: 401

## 5. Session Management

### Test 9: Get Active Sessions

**Using Frontend:**
1. Login to the application
2. Navigate to Settings or Profile
3. Look for "Active Sessions" section
4. Should see current session with device info

**Using cURL:**
```bash
curl http://localhost:5000/api/user/sessions \
  -b cookies.txt
```

### Test 10: Logout

**Using Frontend:**
1. Click on user dropdown/menu
2. Click "Logout"
3. Expected: Redirect to login page
4. Cookie should be cleared

**Using cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -b cookies.txt
```

**Check After Logout:**
- Application > Cookies: `rt` cookie should be removed
- Accessing `/api/auth/me` should return 401

## 6. Password Reset Flow

### Test 11: Request Password Reset

**Using cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Password reset code sent",
  "data": {
    "resetCode": "123456"
  }
}
```

Note: `resetCode` is only returned in development mode.

### Test 12: Reset Password

**Using cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "123456",
    "newPassword": "NewPass123!"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Password reset successful"
}
```

## 7. Error Handling

### Test 13: Network Error

1. Stop the backend server
2. Try to login from frontend
3. Expected: Error message "Failed to connect to server"

### Test 14: Invalid JSON

**Using cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d 'invalid json'
```

**Expected:** 400 Bad Request

### Test 15: Missing Required Fields

**Using cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test"
  }'
```

**Expected:** 400 Bad Request with validation error

## 8. Frontend Integration Tests

### Test 16: Auth Context

1. Open browser DevTools Console
2. Type:
   ```javascript
   window.location = '/signin'
   ```
3. Login with valid credentials
4. Open Console again and type:
   ```javascript
   // This won't work in production, but for testing you can check localStorage
   document.cookie
   ```
5. Should see the `rt` cookie

### Test 17: API Client

Open Console and test the API client:

```javascript
// This is just for demonstration - don't do this in production
fetch('/api/health', {
  method: 'GET',
  credentials: 'include'
})
.then(r => r.json())
.then(console.log);
```

### Test 18: Protected Routes

1. Without logging in, try to access: `http://localhost:5173/dashboard`
2. Expected: Redirect to login page
3. Login
4. Try accessing `/dashboard` again
5. Expected: Can access the page

## 9. Common Issues and Solutions

### Issue: CORS Error

**Symptoms:**
- Console shows: "Access to fetch at '...' from origin '...' has been blocked by CORS policy"

**Solution:**
1. Check backend `.env`: `CLIENT_ORIGIN=http://localhost:5173`
2. Restart backend server
3. Clear browser cache
4. Try again

### Issue: Cookie Not Set

**Symptoms:**
- Login succeeds but user is not authenticated on next request
- No `rt` cookie in Application > Cookies

**Solution:**
1. Check backend cookie configuration
2. Ensure frontend uses `credentials: 'include'`
3. Check SameSite settings in backend config
4. Verify domain/path settings

### Issue: 401 Unauthorized

**Symptoms:**
- Every API request returns 401

**Solution:**
1. Verify JWT secrets are set in backend `.env`
2. Check token hasn't expired
3. Ensure user is logged in
4. Check middleware is properly configured

### Issue: Connection Refused

**Symptoms:**
- Frontend can't connect to backend
- Network error in console

**Solution:**
1. Verify backend is running: `curl http://localhost:5000/api/health`
2. Check `VITE_API_URL` in frontend `.env`
3. Verify Vite proxy in `vite.config.ts`
4. Check firewall settings

## 10. Performance Testing

### Test 19: Response Times

Use browser DevTools Network tab to check:
- API requests should complete in < 100ms for simple queries
- Initial page load should be < 2s
- No requests should take > 5s

### Test 20: Concurrent Requests

Open multiple tabs and login simultaneously. All should work without issues.

### Test 21: Large Payloads

Test with a large dataset (e.g., 1000 users). API should handle it gracefully.

## Success Criteria

✅ All tests pass
✅ No CORS errors
✅ Cookies are set correctly
✅ Authentication works end-to-end
✅ Protected routes are secured
✅ Error messages are user-friendly
✅ No console errors
✅ Response times are acceptable

## Next Steps

After successful testing:
1. Set up automated tests (Jest, Cypress, etc.)
2. Configure CI/CD pipeline
3. Set up monitoring and logging
4. Prepare for production deployment
5. Document any custom configurations
