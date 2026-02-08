import { useCallback } from 'react';
import { Link, useLocation } from 'react-router';
import {
  Home,
  Package,
  Warehouse,
  ShoppingCart,
  ShoppingBag,
  RotateCcw,
  ArrowLeftRight,
  DollarSign,
  Users,
  UserCog,
  Shield,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useSidebar } from '../context/SidebarContext';

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path: string;
};

const navItems: NavItem[] = [
  {
    icon: <Home />,
    name: 'Home',
    path: '/',
  },
  {
    icon: <Package />,
    name: 'Products',
    path: '/products',
  },
  {
    icon: <Warehouse />,
    name: 'Stock',
    path: '/stock',
  },
  {
    icon: <ShoppingCart />,
    name: 'Sales',
    path: '/sales',
  },
  {
    icon: <ShoppingBag />,
    name: 'Purchases',
    path: '/purchases',
  },
  {
    icon: <RotateCcw />,
    name: 'Returns',
    path: '/returns',
  },
  {
    icon: <ArrowLeftRight />,
    name: 'Transfers',
    path: '/transfers',
  },
  {
    icon: <DollarSign />,
    name: 'Finance Management',
    path: '/finance',
  },
  {
    icon: <Users />,
    name: 'Customers',
    path: '/customers',
  },
  {
    icon: <UserCog />,
    name: 'Employees',
    path: '/employees',
  },
  {
    icon: <Shield />,
    name: 'System & Security',
    path: '/system',
  },
  {
    icon: <Settings />,
    name: 'Settings',
    path: '/settings',
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleSidebar } = useSidebar();
  const location = useLocation();

  const isActive = useCallback(
    (path: string) => {
      if (path === '/') {
        return location.pathname === '/';
      }
      return location.pathname.startsWith(path);
    },
    [location.pathname]
  );

  const showExpanded = isExpanded || isHovered || isMobileOpen;

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 left-0 bg-white dark:bg-slate-900 dark:border-slate-800 text-slate-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-slate-200 
        ${showExpanded
          ? 'w-[280px]'
          : 'w-[80px]'
        }
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo */}
      <div
        className={`py-6 px-5 flex items-center ${!showExpanded ? 'lg:justify-center' : 'justify-between'
          }`}
      >
        <Link to="/" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          {showExpanded && (
            <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent">
              Inventory
            </span>
          )}
        </Link>

        {showExpanded && (
          <button
            onClick={toggleSidebar}
            className="hidden lg:flex p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {isExpanded ? (
              <ChevronLeft className="w-5 h-5 text-slate-500" />
            ) : (
              <ChevronRight className="w-5 h-5 text-slate-500" />
            )}
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3">
        <nav className="space-y-1">
          {navItems.map((nav) => {
            const active = isActive(nav.path);

            return (
              <Link
                key={nav.name}
                to={nav.path}
                className={`menu-item group ${active ? 'menu-item-active' : 'menu-item-inactive'
                  } ${!showExpanded ? 'lg:justify-center' : ''}`}
              >
                <span
                  className={`flex-shrink-0 ${active
                    ? 'menu-item-icon-active'
                    : 'menu-item-icon-inactive'
                    }`}
                >
                  {nav.icon}
                </span>
                {showExpanded && (
                  <span className="text-sm font-medium">{nav.name}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      {showExpanded && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
            © 2026 Inventory System
          </div>
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;
