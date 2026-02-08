# Backend Schema Reference

This document outlines the actual backend API schema for the frontend integration.

## Authentication Schemas

### Register
```typescript
{
  name: string;           // Full name (required, min 2 chars)
  username?: string;      // Optional (min 3 chars)
  phone?: string;         // Optional
  password: string;       // Required (min 6 chars)
  branch_id?: number;     // Optional, defaults to 1
  role_id?: number;       // Optional, defaults to 1
}
```
**Note:** Either `username` OR `phone` must be provided.

### Login
```typescript
{
  identifier: string;     // Username or phone (required)
  password: string;       // Required
}
```

### Forgot Password
```typescript
{
  identifier: string;     // Username or phone (required)
}
```

### Reset Password
```typescript
{
  identifier: string;     // Username or phone (required)
  code: string;          // 6-digit reset code (required)
  newPassword: string;   // New password (required, min 6 chars)
}
```

## Response Schemas

### User Profile (UserProfile)
```typescript
{
  user_id: number;
  name: string;
  username: string;
  phone: string | null;
  role_id: number;
  role_name: string;
  branch_id: number;
  branch_name: string;
  is_active: boolean;
}
```

### Auth Response
```typescript
{
  success: boolean;
  data: {
    accessToken: string;
    user: UserProfile;
  };
  message?: string;
}
```

### Error Response
```typescript
{
  success: false;
  message: string;
  error?: string;
}
```

## Key Differences from Initial Implementation

1. **Login field**: Uses `identifier` instead of `username` or `email`
2. **User name**: Uses single `name` field instead of `first_name`/`last_name`
3. **No email field**: Backend uses `phone` instead of `email`
4. **Branch system**: Backend includes `branch_id` and `branch_name`
5. **Reset code**: Uses 6-digit numeric code, not a token string

## API Endpoints

All endpoints return the standard response format:
```typescript
{
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}
```

### POST /api/auth/register
- Body: RegisterInput
- Returns: { accessToken, user }
- Sets refresh token cookie

### POST /api/auth/login
- Body: LoginInput
- Returns: { accessToken, user }
- Sets refresh token cookie

### POST /api/auth/logout
- Requires: Authentication
- Returns: success message
- Clears refresh token cookie

### GET /api/auth/me
- Requires: Authentication
- Returns: { user, role, permissions }

### POST /api/auth/refresh
- Requires: Refresh token cookie
- Returns: { accessToken }

### POST /api/auth/forgot-password
- Body: ForgotPasswordInput
- Returns: success message (code in dev mode)

### POST /api/auth/reset-password
- Body: ResetPasswordInput
- Returns: success message

## Frontend Implementation Notes

### Updated Files
1. `src/services/auth.service.ts` - Updated interfaces
2. `src/components/auth/SignInForm.tsx` - Changed to use `identifier`
3. `src/components/auth/SignUpForm.tsx` - Changed to use `name`, `username`, `phone`
4. `src/types/index.ts` - Updated User interface

### Form Changes

**Sign In Form:**
- Changed "Username or Email" to "Username or Phone"
- Changed state variable from `username` to `identifier`
- Sends `identifier` instead of `username`

**Sign Up Form:**
- Changed from separate first/last name fields to single "Full Name" field
- Removed email field
- Added phone field
- Made username and phone both optional (but at least one required)
- Added validation to ensure username OR phone is provided

### Usage Examples

**Login:**
```typescript
const response = await authService.login({
  identifier: "john123",  // or phone number
  password: "password123"
});
```

**Register:**
```typescript
const response = await authService.register({
  name: "John Doe",
  username: "john123",    // optional
  phone: "1234567890",    // optional (but one of username/phone required)
  password: "password123"
});
```

**Password Reset:**
```typescript
// Request reset
await authService.forgotPassword({
  identifier: "john123"
});

// Reset with code
await authService.resetPassword({
  identifier: "john123",
  code: "123456",        // 6-digit code
  newPassword: "newpass123"
});
```

## Testing

### Test Registration
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "username": "testuser",
    "password": "test123"
  }'
```

### Test Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "testuser",
    "password": "test123"
  }'
```

## Migration Notes

If you need to migrate existing data:

1. **User names**: Combine `first_name` and `last_name` into `name`
2. **Email to phone**: If using email, consider adding a phone field or using email as identifier
3. **Username**: Make sure at least username or phone is set for each user
4. **Branch assignment**: Assign all users to a default branch (branch_id = 1)

## Common Errors

### "Required" validation error
- Check that all required fields are being sent
- Verify field names match exactly (e.g., `identifier` not `username`)

### "Either username or phone must be provided"
- Registration requires at least one of these fields
- Make sure one is filled in the form

### "Invalid credentials"
- Check that `identifier` matches the user's username or phone
- Verify password is correct
