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
      return false;
    };
    const modules: SidebarMenuItem[] = [];

    if (has('home.view')) {
      modules.push({
        id: 'home',
        name: 'Home',
        nameSo: 'Guriga',
        icon: 'Home',
        route: '/',
        permission: 'home.view',
      });
    }

    if (has('items.view') || has('products.view') || has('stock.view')) {
      const storePermission =
        has('items.view') || has('products.view') ? 'items.view' : 'stock.view';
      modules.push({
        id: 'store-management',
        name: 'Store Management',
        nameSo: 'Maareynta Dukaanka',
        icon: 'Box',
        route: '/store-management',
        permission: storePermission,
        items: [
          {
            id: 'store-items',
            name: 'Items',
            nameSo: 'Alaabta',
            route: '/store-management/items',
            permission: 'items.view',
          },
          {
            id: 'store-categories',
            name: 'Categories',
            nameSo: 'Qaybaha',
            route: '/store-management/categories',
            permission: 'items.view',
          },
          {
            id: 'store-units',
            name: 'Units',
            nameSo: 'Cabbirrada',
            route: '/store-management/units',
            permission: 'items.view',
          },
          {
            id: 'store-stock-levels',
            name: 'Stock Levels',
            nameSo: 'Heerarka Kaydka',
            route: '/store-management/stock',
            permission: 'stock.view',
          },
          {
            id: 'store-stock-adjustments',
            name: 'Adjustments',
            nameSo: 'Hagaajinta',
            route: '/store-management/stock/adjustments',
            permission: 'stock.adjust',
          },
          {
            id: 'store-stock-recount',
            name: 'Stock Recount',
            nameSo: 'Tirinta Kaydka',
            route: '/store-management/stock/recount',
            permission: 'stock.recount',
          },
          {
            id: 'store-stores',
            name: 'Stores',
            nameSo: 'Dukaamyada',
            route: '/store-management/stores',
            permission: 'stock.view',
          },
        ].filter((item) => has(item.permission)),
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

    if (has('employees.view')) {
      modules.push({
        id: 'employees',
        name: 'Employees',
        nameSo: 'Shaqaalaha',
        icon: 'UserCircle',
        route: '/employees',
        permission: 'employees.view',
        items: [
          {
            id: 'employees-list',
            name: 'Employees List',
            nameSo: 'Liiska Shaqaalaha',
            route: '/employees',
            permission: 'employees.view',
          },
          {
            id: 'employees-shifts',
            name: 'Shifts',
            nameSo: 'Wareegyada',
            route: '/employees/shifts',
            permission: 'employees.view',
          },
        ].filter((item) => has(item.permission)),
      });
    }

    if (has('finance.view')) {
      modules.push({
        id: 'finance',
        name: 'Finance',
        nameSo: 'Maaliyadda',
        icon: 'DollarSign',
        route: '/finance',
        permission: 'finance.view',
        items: [
          {
            id: 'finance-overview',
            name: 'Overview',
            nameSo: 'Dulmar',
            route: '/finance',
            permission: 'finance.view',
          },
          {
            id: 'finance-payroll',
            name: 'Payroll',
            nameSo: 'Mushaharka',
            route: '/finance/payroll',
            permission: 'finance.view',
          },
          {
            id: 'finance-expense',
            name: 'Expense',
            nameSo: 'Kharash',
            route: '/finance/expense',
            permission: 'finance.view',
          },
        ].filter((item) => has(item.permission)),
      });
    }

    if (has('reports.view')) {
      modules.push({
        id: 'reports',
        name: 'Reports',
        nameSo: 'Warbixinno',
        icon: 'BarChart3',
        route: '/reports',
        permission: 'reports.view',
      });
    }

    if (has('settings.view')) {
      modules.push({
        id: 'settings',
        name: 'Settings',
        nameSo: 'Dejinta',
        icon: 'Cog',
        route: '/settings',
        permission: 'settings.view',
      });
    }

    return modules;
  }
}

export const sidebarService = new SidebarService();
