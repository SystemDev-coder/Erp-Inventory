import { queryOne, query } from '../../db/query';
import crypto from 'crypto';
import { SidebarMenuResponse, SidebarMenuItem } from './session.types';

export class SidebarService {
  /**
   * Generate sidebar menu based on user permissions
   */
  async generateSidebar(userId: number, permissions: string[]): Promise<SidebarMenuResponse> {
    // Check cache first
    const cached = await this.getCachedSidebar(userId, permissions);
    if (cached) {
      return {
        modules: cached,
        cached: true,
        timestamp: new Date(),
      };
    }

    // Generate fresh menu
    const modules = this.buildSidebarMenu(permissions);

    // Cache the result
    await this.cacheSidebar(userId, permissions, modules);

    return {
      modules,
      cached: false,
      timestamp: new Date(),
    };
  }

  /**
   * Build sidebar menu structure from permissions
   */
  private buildSidebarMenu(permissions: string[]): SidebarMenuItem[] {
    const permSet = new Set(permissions);
    const modules: SidebarMenuItem[] = [];

    // Home/Dashboard
    if (permSet.has('home.view')) {
      modules.push({
        id: 'home',
        name: 'Home',
        nameSo: 'Guriga',
        icon: 'Home',
        route: '/',
        permission: 'home.view',
      });
    }

    // Products
    if (permSet.has('products.view')) {
      modules.push({
        id: 'products',
        name: 'Products',
        nameSo: 'Alaabada',
        icon: 'Package',
        route: '/products',
        permission: 'products.view',
      });
    }

    // Stock
    if (permSet.has('stock.view')) {
      modules.push({
        id: 'stock',
        name: 'Stock',
        nameSo: 'Kaydka',
        icon: 'BarChart3',
        route: '/stock',
        permission: 'stock.view',
        items: [
          {
            id: 'stock-levels',
            name: 'Stock Levels',
            nameSo: 'Heerarka Kaydka',
            route: '/stock',
            permission: 'stock.view',
          },
          {
            id: 'stock-adjustments',
            name: 'Adjustments',
            nameSo: 'Hagaajinta',
            route: '/stock/adjustments',
            permission: 'stock.adjust',
          },
          {
            id: 'stock-recount',
            name: 'Stock Recount',
            nameSo: 'Tirinta Kaydka',
            route: '/stock/recount',
            permission: 'stock.recount',
          },
        ].filter((item) => permSet.has(item.permission)),
      });
    }

    // Sales
    if (permSet.has('sales.view')) {
      const salesItems = [
        {
          id: 'sales-transactions',
          name: 'Transactions',
          nameSo: 'Dhaqaaqyada',
          route: '/sales',
          permission: 'sales.view',
        },
      ];

      if (permSet.has('sales.pos')) {
        salesItems.push({
          id: 'sales-pos',
          name: 'POS',
          nameSo: 'POS',
          route: '/sales/pos',
          permission: 'sales.pos',
        });
      }

      modules.push({
        id: 'sales',
        name: 'Sales',
        nameSo: 'Iibka',
        icon: 'ShoppingCart',
        route: '/sales',
        permission: 'sales.view',
        items: salesItems,
      });
    }

    // Purchases
    if (permSet.has('purchases.view')) {
      modules.push({
        id: 'purchases',
        name: 'Purchases',
        nameSo: 'Iibsashada',
        icon: 'ShoppingBag',
        route: '/purchases',
        permission: 'purchases.view',
        items: [
          {
            id: 'purchases-orders',
            name: 'Purchase Orders',
            nameSo: 'Dalabada Iibsiga',
            route: '/purchases',
            permission: 'purchases.view',
          },
        ],
      });
    }

    // Returns
    if (permSet.has('returns.view')) {
      modules.push({
        id: 'returns',
        name: 'Returns',
        nameSo: 'Celinta',
        icon: 'Undo2',
        route: '/returns',
        permission: 'returns.view',
      });
    }

    // Transfers
    if (permSet.has('transfers.view')) {
      modules.push({
        id: 'transfers',
        name: 'Transfers',
        nameSo: 'Wareejinta',
        icon: 'ArrowLeftRight',
        route: '/transfers',
        permission: 'transfers.view',
      });
    }

    // Finance
    if (permSet.has('finance.view')) {
      const financeItems = [
        {
          id: 'finance-overview',
          name: 'Overview',
          nameSo: 'Dulmar',
          route: '/finance',
          permission: 'finance.view',
        },
      ];

      if (permSet.has('finance.expenses')) {
        financeItems.push({
          id: 'finance-expenses',
          name: 'Expenses',
          nameSo: 'Kharashyada',
          route: '/finance/expenses',
          permission: 'finance.expenses',
        });
      }

      if (permSet.has('finance.payments')) {
        financeItems.push({
          id: 'finance-payments',
          name: 'Payments',
          nameSo: 'Lacag Bixinta',
          route: '/finance/payments',
          permission: 'finance.payments',
        });
      }

      if (permSet.has('finance.reports')) {
        financeItems.push({
          id: 'finance-reports',
          name: 'Reports',
          nameSo: 'Warbixinada',
          route: '/finance/reports',
          permission: 'finance.reports',
        });
      }

      modules.push({
        id: 'finance',
        name: 'Finance',
        nameSo: 'Maaliyadda',
        icon: 'DollarSign',
        route: '/finance',
        permission: 'finance.view',
        items: financeItems,
      });
    }

    // Customers
    if (permSet.has('customers.view')) {
      modules.push({
        id: 'customers',
        name: 'Customers',
        nameSo: 'Macaamiisha',
        icon: 'Users',
        route: '/customers',
        permission: 'customers.view',
      });
    }

    // Employees
    if (permSet.has('employees.view')) {
      modules.push({
        id: 'employees',
        name: 'Employees',
        nameSo: 'Shaqaalaha',
        icon: 'UserCircle',
        route: '/employees',
        permission: 'employees.view',
      });
    }

    // System & Security
    if (permSet.has('system.users') || permSet.has('system.roles')) {
      const systemItems = [];

      if (permSet.has('system.users')) {
        systemItems.push({
          id: 'system-access-control',
          name: 'Access Control',
          nameSo: 'Xakamaynta Gelitaanka',
          route: '/system/access-control',
          permission: 'system.users',
        });
      }

      if (permSet.has('system.branches')) {
        systemItems.push({
          id: 'system-branches',
          name: 'Branches',
          nameSo: 'Laanaha',
          route: '/system/branches',
          permission: 'system.branches',
        });
      }

      if (permSet.has('system.audit')) {
        systemItems.push({
          id: 'system-audit',
          name: 'Audit Logs',
          nameSo: 'Diiwaanka',
          route: '/system/audit',
          permission: 'system.audit',
        });
      }

      modules.push({
        id: 'system',
        name: 'System & Security',
        nameSo: 'Nidaamka & Amniga',
        icon: 'Settings',
        route: '/system',
        permission: 'system.users',
        items: systemItems,
      });
    }

    // Settings
    if (permSet.has('settings.view')) {
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

  /**
   * Get cached sidebar menu
   */
  private async getCachedSidebar(
    userId: number,
    permissions: string[]
  ): Promise<SidebarMenuItem[] | null> {
    const permissionsHash = crypto
      .createHash('sha256')
      .update(permissions.sort().join(','))
      .digest('hex');

    const cached = await queryOne<{ menu_data: SidebarMenuItem[]; expires_at: Date }>(
      `SELECT menu_data, expires_at FROM ims.sidebar_menu_cache 
       WHERE user_id = $1 AND permissions_hash = $2 AND expires_at > NOW()`,
      [userId, permissionsHash]
    );

    return cached ? cached.menu_data : null;
  }

  /**
   * Cache sidebar menu
   */
  private async cacheSidebar(
    userId: number,
    permissions: string[],
    menu: SidebarMenuItem[]
  ): Promise<void> {
    const permissionsHash = crypto
      .createHash('sha256')
      .update(permissions.sort().join(','))
      .digest('hex');

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Get user's role
    const user = await queryOne<{ role_id: number }>(
      'SELECT role_id FROM ims.users WHERE user_id = $1',
      [userId]
    );

    if (!user) return;

    await query(
      `INSERT INTO ims.sidebar_menu_cache (user_id, role_id, menu_data, permissions_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, role_id) DO UPDATE 
       SET menu_data = $3, permissions_hash = $4, expires_at = $5`,
      [userId, user.role_id, JSON.stringify(menu), permissionsHash, expiresAt]
    );
  }
}

export const sidebarService = new SidebarService();
