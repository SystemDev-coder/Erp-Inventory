import { SidebarMenuItem, SidebarMenuResponse } from './session.types';

export class SidebarService {
  async generateSidebar(
    _userId: number,
    permissions: string[]
  ): Promise<SidebarMenuResponse> {
    return {
      modules: this.buildSidebarMenu(permissions),
      cached: false,
      timestamp: new Date(),
    };
  }

  private buildSidebarMenu(permissions: string[]): SidebarMenuItem[] {
    const has = (perm: string) => {
      if (permissions.includes(perm)) return true;
      if (perm.startsWith('items.')) {
        return permissions.includes(perm.replace('items.', 'products.'));
      }
      if (perm.startsWith('products.')) {
        return permissions.includes(perm.replace('products.', 'items.'));
      }
      if (perm === 'stock.view' && permissions.includes('warehouse_stock.view')) return true;
      if (perm === 'stock.adjust' && permissions.includes('inventory_movements.create')) return true;
      if (perm === 'stock.recount' && permissions.includes('inventory_movements.create')) return true;
      return false;
    };
    const modules: SidebarMenuItem[] = [];

    // Exact top-to-bottom order required by product:
    // 1) Customers
    // 2) Store
    // 3) Products
    // 4) Purchases
    // 5) Sales
    // 6) Stock / Inventory
    // 7) Suppliers
    // 8) Employees / Users
    // 9) Finance (bottom)
    // 10) Reports (bottom)
    // 11) System (bottom)
    // 12) Settings (bottom)
    if (has('customers.view')) {
      modules.push({
        id: 'customers',
        name: 'Customers',
        nameSo: 'Macaamiisha',
        icon: 'Users',
        route: '/customers',
        permission: 'customers.view',
      });
    }

    if (
      has('stores.view') ||
      has('warehouse_stock.view') ||
      has('stock.view') ||
      has('inventory_movements.view')
    ) {
      modules.push({
        id: 'stock-management',
        name: 'Stock Management',
        nameSo: 'Maamulka Kaydka',
        icon: 'Box',
        route: '/stock-management/items',
        permission: 'warehouse_stock.view',
      });
    }

    if (has('items.view') || has('products.view')) {
      modules.push({
        id: 'products',
        name: 'Products',
        nameSo: 'Alaab',
        icon: 'Package',
        route: '/products',
        permission: 'items.view',
      });
    }

    if (has('purchases.view')) {
      modules.push({
        id: 'purchases',
        name: 'Purchases',
        nameSo: 'Iibsashada',
        icon: 'ShoppingBag',
        route: '/purchases',
        permission: 'purchases.view',
      });
    }

    if (has('sales.view')) {
      modules.push({
        id: 'sales',
        name: 'Sales',
        nameSo: 'Iibka',
        icon: 'ShoppingCart',
        route: '/sales',
        permission: 'sales.view',
      });
    }

    if (has('warehouse_stock.view') || has('stock.view')) {
      modules.push({
        id: 'inventory',
        name: 'Inventory',
        nameSo: 'Kayd',
        icon: 'BarChart3',
        route: '/inventory',
        permission: 'warehouse_stock.view',
      });
    }

    if (has('suppliers.view')) {
      modules.push({
        id: 'suppliers',
        name: 'Suppliers',
        nameSo: 'Alaab-qeybiyeyaal',
        icon: 'Users',
        route: '/suppliers',
        permission: 'suppliers.view',
      });
    }

    if (has('employees.view') || has('users.view')) {
      modules.push({
        id: 'employees',
        name: 'Employees',
        nameSo: 'Shaqaalaha',
        icon: 'UserCircle',
        route: '/employees',
        permission: 'employees.view',
      });
    }

    // Required to be visible for all authenticated users.
    modules.push(
      {
        id: 'finance',
        name: 'Finance',
        nameSo: 'Maaliyadda',
        icon: 'DollarSign',
        route: '/finance',
        permission: 'accounts.view',
      },
      {
        id: 'reports',
        name: 'Reports',
        nameSo: 'Warbixinno',
        icon: 'BarChart3',
        route: '/reports',
        permission: 'reports.all',
      },
      {
        id: 'system',
        name: 'System',
        nameSo: 'Nidaamka',
        icon: 'Settings',
        route: '/system',
        permission: 'system.users.manage',
      },
      {
        id: 'settings',
        name: 'Settings',
        nameSo: 'Dejinta',
        icon: 'Cog',
        route: '/settings',
        permission: 'system.settings',
      }
    );

    return modules;
  }
}

export const sidebarService = new SidebarService();
