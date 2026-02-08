# Frontend-Backend Connection Verification Checklist

Use this checklist to verify that the frontend and backend are properly connected and communicating.

## Prerequisites Check

Before testing, ensure:

- [ ] PostgreSQL is running
- [ ] Database schema is installed
- [ ] Backend `.env` is configured
- [ ] Frontend `.env` exists
- [ ] Node modules are installed in both projects

## Backend Verification

### 1. Server Running ✓
```bash
cd server
npm run dev
```

Expected output:
```
Server running on http://localhost:5000
Database connected successfully
```

### 2. Health Endpoint ✓
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

### 3. CORS Headers ✓
```bash
curl -i http://localhost:5000/api/health
```

Should see headers:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
```

## Frontend Verification

### 1. Dev Server Running ✓
```bash
cd frontend
npm run dev
```

Expected output:
```
VITE v6.1.0  ready in ... ms

➜  Local:   http://localhost:5173/
```

### 2. Environment Variables ✓
Open browser console and run:
```javascript
console.log(import.meta.env.VITE_API_URL); // Should show: http://localhost:5000
```

### 3. API Client Available ✓
Check that API services are imported correctly by looking at the Network tab in DevTools.

## Integration Tests

### Test 1: Registration Flow ✓

**Steps:**
1. Open `http://localhost:5173/signup`
2. Fill in registration form:
   - First Name: Test
   - Last Name: User
   - Username: testuser
   - Email: test@example.com
   - Password: Test123!
3. Check "I agree to terms"
4. Click "Sign Up"

**Expected Results:**
- [ ] No console errors
- [ ] Network request to `/api/auth/register` with status 200
- [ ] Response includes user object and accessToken
- [ ] Cookie `rt` is set in Application > Cookies
- [ ] Redirected to dashboard
- [ ] User info visible in UI

**If Failed:**
- Check backend console for errors
- Verify database is connected
- Check CORS configuration
- Verify form data is being sent correctly

### Test 2: Login Flow ✓

**Steps:**
1. If logged in, logout first
2. Open `http://localhost:5173/signin`
3. Enter credentials:
   - Username: testuser
   - Password: Test123!
4. Click "Sign in"

**Expected Results:**
- [ ] No console errors
- [ ] Network request to `/api/auth/login` with status 200
- [ ] Response includes user object and accessToken
- [ ] Cookie `rt` is set (refresh token)
- [ ] Redirected to dashboard
- [ ] User is authenticated

**If Failed:**
- Check credentials are correct
- Verify user exists in database
- Check JWT secrets are set
- Look for error messages in response

### Test 3: Authentication Persistence ✓

**Steps:**
1. Login successfully
2. Refresh the page (F5)

**Expected Results:**
- [ ] User remains logged in
- [ ] Network request to `/api/auth/me` with status 200
- [ ] User data is loaded
- [ ] No redirect to login page

**If Failed:**
- Check cookie is persisting
- Verify token validation in backend
- Check AuthContext is properly initialized

### Test 4: Protected Route Access ✓

**Steps:**
1. Logout completely
2. Try to access: `http://localhost:5173/dashboard`

**Expected Results:**
- [ ] Redirected to login page
- [ ] No error in console

Then login and try again:
- [ ] Can access dashboard
- [ ] User info displayed

### Test 5: Logout Flow ✓

**Steps:**
1. While logged in, click Logout
2. Check cookies

**Expected Results:**
- [ ] Network request to `/api/auth/logout` with status 200
- [ ] Cookie `rt` is removed
- [ ] Redirected to login page
- [ ] Cannot access protected routes

### Test 6: API Error Handling ✓

**Steps:**
1. Stop the backend server
2. Try to login from frontend

**Expected Results:**
- [ ] Error message displayed: "Failed to connect to server"
- [ ] No unhandled errors in console
- [ ] UI shows appropriate error state

Restart backend and try again:
- [ ] Login works normally

### Test 7: Invalid Credentials ✓

**Steps:**
1. Try to login with wrong password

**Expected Results:**
- [ ] Error message displayed
- [ ] Status code 401 or 400
- [ ] No redirect
- [ ] Form remains usable

### Test 8: Session Management ✓

**Steps:**
1. Login successfully
2. Make API call: `await userService.getPermissions()`

**Expected Results:**
- [ ] Request includes credentials
- [ ] Cookie sent automatically
- [ ] Response received successfully
- [ ] No CORS errors

## Browser DevTools Verification

### Network Tab ✓
Open DevTools > Network and perform login:

**Check:**
- [ ] Request URL: `http://localhost:5000/api/auth/login`
- [ ] Method: POST
- [ ] Status: 200
- [ ] Request Headers include `Content-Type: application/json`
- [ ] Response Headers include `Set-Cookie`
- [ ] Request Payload includes username and password
- [ ] Response includes user data and accessToken

### Application Tab ✓
Open DevTools > Application > Cookies > `http://localhost:5173`:

**Check:**
- [ ] Cookie name: `rt` (refresh token)
- [ ] HTTPOnly: ✓ (should be checked)
- [ ] SameSite: Lax
- [ ] Path: /
- [ ] Expires: 7 days from now

### Console Tab ✓
**Check:**
- [ ] No CORS errors
- [ ] No authentication errors
- [ ] No fetch errors
- [ ] No type errors

## API Client Test (Browser Console)

Open browser console and run:

```javascript
// Test health check
await fetch('http://localhost:5000/api/health').then(r => r.json())
// Should return: { success: true, message: "Server is healthy" }

// Test health check utility (if available)
await checkApiHealth()
// Should show health status
```

## Service Method Tests

In a component or console:

```javascript
// Test auth service
import { authService } from './services/auth.service';
await authService.getCurrentUser();

// Test user service  
import { userService } from './services/user.service';
await userService.getPermissions();
```

## Common Issues Checklist

### CORS Errors ✓
If you see CORS errors:
- [ ] Backend `CLIENT_ORIGIN` matches frontend URL exactly
- [ ] Backend server restarted after env change
- [ ] Browser cache cleared
- [ ] No typos in URLs

### Cookie Not Set ✓
If cookies aren't being set:
- [ ] Backend sends `Set-Cookie` header
- [ ] Frontend uses `credentials: 'include'`
- [ ] Cookie settings correct in backend
- [ ] Browser allows cookies
- [ ] Not in incognito mode with strict settings

### 401 Errors ✓
If getting unauthorized errors:
- [ ] JWT secrets set in backend `.env`
- [ ] Token format is correct
- [ ] User is logged in
- [ ] Token hasn't expired
- [ ] Middleware is working

### Network Errors ✓
If can't connect:
- [ ] Backend is running on port 5000
- [ ] Frontend `VITE_API_URL` is correct
- [ ] Vite proxy configured
- [ ] Firewall not blocking
- [ ] Correct ports in use

## Final Verification Checklist

- [ ] Backend server starts without errors
- [ ] Frontend dev server starts without errors
- [ ] Health endpoint returns 200
- [ ] Can register a new user
- [ ] Can login with credentials
- [ ] Cookie is set after login
- [ ] User stays logged in after refresh
- [ ] Protected routes are secured
- [ ] Can logout successfully
- [ ] Cookie is removed after logout
- [ ] Error messages display correctly
- [ ] No CORS errors in console
- [ ] No type errors in console
- [ ] API requests include credentials
- [ ] Responses are handled correctly

## Performance Verification

### Response Times ✓
Check in Network tab:
- [ ] `/api/health` < 50ms
- [ ] `/api/auth/login` < 200ms
- [ ] `/api/auth/me` < 100ms
- [ ] `/api/user/permissions` < 150ms

### Initial Load ✓
- [ ] Frontend loads < 2s
- [ ] Auth check completes < 500ms
- [ ] No unnecessary API calls
- [ ] No duplicate requests

## Security Verification

- [ ] Refresh tokens are HTTP-only
- [ ] Passwords are not logged
- [ ] JWT secrets are strong (32+ chars)
- [ ] HTTPS in production (when deployed)
- [ ] Input validation works
- [ ] Error messages don't leak sensitive info

## Documentation Verification

- [ ] README.md is complete
- [ ] INTEGRATION_GUIDE.md explains architecture
- [ ] TESTING.md provides test procedures
- [ ] QUICKSTART.md works
- [ ] All code is commented
- [ ] Types are documented

## Deployment Readiness

Before deploying to production:
- [ ] Environment variables are production-ready
- [ ] JWT secrets are changed from defaults
- [ ] `COOKIE_SECURE=true` in production
- [ ] Database is production database
- [ ] Error logging is set up
- [ ] CORS is configured for production domain
- [ ] HTTPS is enabled
- [ ] Rate limiting is enabled
- [ ] Security headers are set

## Success Criteria

✅ **All tests pass**
✅ **No errors in console**
✅ **Cookies work correctly**
✅ **Authentication persists**
✅ **API communication is stable**
✅ **Error handling works**
✅ **Performance is acceptable**
✅ **Documentation is complete**

## Sign-Off

Once all checks pass, the frontend-backend integration is **verified and working** ✓

Date: _________________
Verified by: _________________

## Next Steps After Verification

1. **Development**
   - Implement additional features
   - Add protected pages
   - Create user management UI
   - Build role-based access control

2. **Testing**
   - Write automated tests
   - Add E2E tests
   - Set up CI/CD

3. **Production**
   - Deploy to staging
   - Load testing
   - Security audit
   - Deploy to production

## Support

If any verification fails:
1. Review error messages carefully
2. Check corresponding section in TESTING.md
3. Verify configuration in README.md
4. Review code in INTEGRATION_GUIDE.md
5. Check troubleshooting in QUICKSTART.md

**The integration is complete and ready to use!** 🎉
