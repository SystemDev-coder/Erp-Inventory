import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

// items./products. and stock./warehouse_stock./inventory. are historically interchangeable
// permission keys in this system (same aliasing ProtectedRoute and the dashboard already use)
// - kept in sync here so a permission check for either name works no matter which one a given
// role/user override actually has stored.
const expandPermissionKeys = (permKey: string): string[] => {
  if (permKey.startsWith('items.')) return [permKey, permKey.replace('items.', 'products.')];
  if (permKey.startsWith('products.')) return [permKey, permKey.replace('products.', 'items.')];
  if (permKey === 'stock.view') return [permKey, 'warehouse_stock.view', 'inventory.view'];
  if (permKey === 'warehouse_stock.view') return [permKey, 'stock.view', 'inventory.view'];
  if (permKey === 'inventory.view') return [permKey, 'stock.view', 'warehouse_stock.view'];
  return [permKey];
};

/**
 * Per-action permission checks for the currently signed-in user (role defaults plus any
 * per-user overrides - both already folded into AuthContext's `permissions` by the backend).
 * Use this to hide/disable specific buttons (Edit, Delete, Add New, ...) within a page the
 * user can otherwise see, rather than relying on route-level access alone.
 *
 * Example: const { can } = usePermissions(); ... {can('customers.create') && <button>New</button>}
 */
export function usePermissions() {
  const { permissions } = useAuth();
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);

  const can = (permKey: string): boolean =>
    expandPermissionKeys(permKey).some((key) => permissionSet.has(key));

  const canAny = (permKeys: string[]): boolean => permKeys.some((key) => can(key));

  return { can, canAny, permissions };
}
