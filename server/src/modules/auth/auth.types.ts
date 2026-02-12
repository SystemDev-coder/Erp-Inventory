export interface User {
  user_id: number;
  branch_id: number;
  role_id: number;
  name: string;
  username: string;
  password_hash: string;
  phone: string | null;
  is_active: boolean;
  created_at: Date;
  refresh_token_hash: string | null;
  reset_code_hash: string | null;
  reset_code_expires: Date | null;
  last_login_at: Date | null;
}

export interface UserProfile {
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

export interface UserWithPermissions {
  user: UserProfile;
  role: {
    role_id: number;
    role_name: string;
  };
  permissions: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterInput {
  name: string;
  username?: string;
  phone?: string;
  password: string;
  branch_id?: number;
  role_id?: number;
}

export interface LoginInput {
  identifier: string;
  password: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface ForgotPasswordInput {
  identifier: string;
}

export interface ResetPasswordInput {
  identifier: string;
  code: string;
  newPassword: string;
}
