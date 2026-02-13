import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  Home,
  Package,
  ShoppingCart,
  BarChart3,
  Box,
  ShoppingBag,
  RotateCcw,
  Undo2,
  ArrowLeftRight,
  DollarSign,
  Users,
  UserCog,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LucideIcon,
} from 'lucide-react';
import { useSidebar } from '../context/SidebarContext';
import { userService } from '../services/user.service';

type SidebarItem = { id: string; name: string; route: string };
type SidebarModule = { id: string; name: string; icon: string; route: string; items?: SidebarItem[] };

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Package,
  BarChart3,
  Warehouse: BarChart3,
  ShoppingCart,
  Box,
  ShoppingBag,
  Undo2,
  RotateCcw,
  ArrowLeftRight,
  DollarSign,
  Users,
  UserCircle: UserCog,
  Settings,
  Cog: Settings,
  Reports: BarChart3,
};

function getIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? ShoppingCart;
}

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleSidebar } = useSidebar();
  const location = useLocation();
  const [modules, setModules] = useState<SidebarModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggleSection = useCallback((id: string) => {
    setOpenSection((prev) => (prev === id ? null : id));
  }, []);

  useEffect(() => {
    let cancelled = false;
    userService
      .getSidebar()
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data?.modules) {
          setModules(res.data.modules);
        } else {
          setModules([]);
        }
      })
      .catch(() => {
        if (!cancelled) setModules([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isActive = useCallback(
    (path: string, exact = false) => {
      const current = location.pathname.replace(/\/+$/, '') || '/';
      const target = path.replace(/\/+$/, '') || '/';

      if (target === '/') return current === '/';
      if (exact) return current === target;
      return current === target || current.startsWith(`${target}/`);
    },
    [location.pathname]
  );

  const showExpanded = isExpanded || isHovered || isMobileOpen;

  const isSectionOpen = useCallback(
    (mod: SidebarModule) => {
      if (openSection === mod.id) return true;
      const activeInSub = mod.items?.some((sub) => isActive(sub.route));
      return !!activeInSub;
    },
    [openSection, location.pathname]
  );

  useEffect(() => {
    if (!modules.length) return;
    const activeParent = modules.find((mod) => mod.items?.some((sub) => isActive(sub.route)));
    if (activeParent) {
      setOpenSection(activeParent.id);
    }
  }, [modules, location.pathname, isActive]);

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 left-0 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 h-screen transition-all duration-300 ease-in-out z-50 shadow-sm
        ${showExpanded ? 'w-[280px]' : 'w-[80px]'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo + collapse/expand */}
      <div
        className={`py-5 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 ${!showExpanded ? 'lg:justify-center px-2' : 'justify-between px-4'}`}
      >
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 shrink-0 bg-primary-600 dark:bg-primary-500 rounded-lg flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          {showExpanded && (
            <span className="text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">
              KeydMaal MS
            </span>
          )}
        </Link>

        <button
          onClick={toggleSidebar}
          aria-label={showExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          className="hidden lg:flex shrink-0 p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500 dark:text-slate-400"
        >
          {showExpanded ? (
            <ChevronLeft className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Section label + Navigation */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {showExpanded && (
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Features
            </p>
            {/* <div className="mt-2 border-t border-slate-200 dark:border-slate-700" /> */}
          </div>
        )}
        <nav className={`px-2 pb-4 ${showExpanded ? 'pt-2' : 'pt-4'}`}>
          {loading ? (
            <div className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading...
            </div>
          ) : (
            <ul className="space-y-0.5">
              {modules.map((mod) => {
                const Icon = getIcon(mod.icon);
                const active = isActive(mod.route);
                const hasChildren = mod.items && mod.items.length > 0;
                const isOpen = hasChildren && isSectionOpen(mod);

                return (
                  <li key={mod.id}>
                    <div
                      className={`flex items-center w-full gap-2 rounded-lg transition-colors ${
                        active
                          ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-800'
                      } ${!showExpanded ? 'lg:justify-center px-0' : 'px-3'}`}
                    >
                      <Link
                        to={mod.route}
                        onClick={(e) => {
                          if (hasChildren) {
                            e.preventDefault();
                            toggleSection(mod.id);
                          }
                        }}
                        className={`flex items-center min-w-0 flex-1 py-2.5 ${!showExpanded ? 'lg:justify-center' : 'gap-3'}`}
                      >
                        <span className="flex-shrink-0 text-slate-600 dark:text-slate-400">
                          <Icon className="w-5 h-5" />
                        </span>
                        {showExpanded && (
                          <span className="text-sm font-medium truncate">{mod.name}</span>
                        )}
                      </Link>
                      {showExpanded && hasChildren && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleSection(mod.id);
                          }}
                          className="flex-shrink-0 p-1 rounded text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          aria-label={isOpen ? 'Collapse' : 'Expand'}
                        >
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                    {showExpanded && hasChildren && isOpen && (
                      <ul className="ml-4 mt-0.5 pl-6 border-l border-slate-200 dark:border-slate-700 space-y-0.5">
                        {mod.items!.map((sub) => {
                          const subActive = isActive(sub.route, true);
                          return (
                            <li key={sub.id}>
                              <Link
                                to={sub.route}
                                className={`block py-2 px-2 rounded-md text-sm transition-colors ${
                                  subActive
                                    ? 'text-primary-600 dark:text-primary-400 font-medium'
                                    : 'text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                              >
                                {sub.name}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      </div>

      {/* Footer */}
      {showExpanded && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            © 2026 KeydMaal MS | All rights reserved
          </p>
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;


