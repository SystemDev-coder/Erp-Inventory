export interface Permission {
  perm_id: number;
  perm_key: string;
  perm_name: string;
  module: string;
  description?: string;
}

export interface PermissionGroup {
  module: string;
  items: Permission[];
  count: number;
}

export interface Role {
  role_id: number;
  role_name: string;
  created_at: Date;
}

export interface RoleWithPermissions extends Role {
  permissions: string[];
}

export interface UserWithRole {
  user_id: number;
  name: string;
  username: string;
  phone: string | null;
  role_id: number;
  role_name: string;
  branch_id: number;
  branch_name: string;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

export interface UserPermissionOverride {
  user_id: number;
  perm_id: number;
  perm_key: string;
  effect: 'allow' | 'deny';
}

export interface AuditLog {
  log_id: number;
  user_id: number;
  action_type: string;
  table_name: string;
  record_id: number | null;
  old_values: any;
  new_values: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}
