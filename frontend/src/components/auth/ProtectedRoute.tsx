import { Navigate, useLocation } from "react-router";
import { useAuth } from "../../context/AuthContext";

/**
 * Wraps routes that require authentication and optional permission.
 */
export default function ProtectedRoute({
  children,
  permission,
  permissionAny,
  roleAny,
}: {
  children: React.ReactNode;
  permission?: string;
  permissionAny?: string[];
  roleAny?: string[];
}) {
  const { isAuthenticated, isLoading, permissions, isLocked, user } = useAuth();
  const location = useLocation();
  const expandPermissionKeys = (permKey: string): string[] => {
    if (permKey.startsWith('items.')) {
      return [permKey, permKey.replace('items.', 'products.')];
    }
    if (permKey.startsWith('products.')) {
      return [permKey, permKey.replace('products.', 'items.')];
    }
    if (permKey === 'stock.view') {
      return [permKey, 'warehouse_stock.view'];
    }
    if (permKey === 'warehouse_stock.view') {
      return [permKey, 'stock.view'];
    }
    return [permKey];
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  if (isLocked && location.pathname !== '/lock') {
    return <Navigate to="/lock" state={{ from: location }} replace />;
  }

  const requiredAny = permissionAny && permissionAny.length > 0 ? permissionAny : permission ? [permission] : undefined;

  if (requiredAny && !requiredAny.some((perm) => expandPermissionKeys(perm).some((key) => permissions.includes(key)))) {
    return <Navigate to="/" replace />; // Or to a forbidden page
  }

  if (roleAny && roleAny.length > 0) {
    const role = (user?.role_name || '').toLowerCase();
    const allowed = roleAny.map((r) => r.toLowerCase());
    if (!allowed.includes(role)) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
