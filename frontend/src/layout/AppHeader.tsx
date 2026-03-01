import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ShoppingCart } from "lucide-react";
import { useSidebar } from "../context/SidebarContext";
import { ThemeToggleButton } from "../components/common/ThemeToggleButton";
import NotificationDropdown from "../components/header/NotificationDropdown";
import UserDropdown from "../components/header/UserDropdown";
import { useAuth } from "../context/AuthContext";

type QuickCommand = {
  id: string;
  label: string;
  to: string;
  keywords: string[];
  permissionAny?: string[];
};

const QUICK_COMMANDS: QuickCommand[] = [
  { id: "dashboard", label: "Open Dashboard", to: "/", keywords: ["home", "kpi"], permissionAny: ["dashboard.view"] },
  { id: "customers", label: "Open Customers", to: "/customers", keywords: ["customer", "ledger"], permissionAny: ["customers.view"] },
  { id: "items", label: "Open Items", to: "/stock-management/items", keywords: ["stock", "products", "inventory"], permissionAny: ["items.view", "products.view", "stock.view", "inventory.view"] },
  { id: "adjust", label: "Open Adjust Items", to: "/stock-management/adjust-items", keywords: ["stock adjust", "adjustment"], permissionAny: ["items.view", "products.view", "stock.view", "inventory.view"] },
  { id: "sales", label: "Open Sales", to: "/sales", keywords: ["sell", "invoice", "pos"], permissionAny: ["sales.view"] },
  { id: "purchases", label: "Open Purchases", to: "/purchases", keywords: ["buy", "supplier"], permissionAny: ["purchases.view", "suppliers.view"] },
  { id: "returns", label: "Open Returns", to: "/return", keywords: ["sales return", "purchase return"], permissionAny: ["sales_returns.view", "items.view", "products.view", "stock.view", "inventory.view"] },
  { id: "finance", label: "Open Finance", to: "/finance", keywords: ["accounts", "money", "payments"], permissionAny: ["finance.reports", "accounts.view", "expenses.view", "ledgers.view"] },
  { id: "assets", label: "Open Assets", to: "/assets", keywords: ["fixed assets", "depreciation"], permissionAny: ["accounts.view"] },
  { id: "receipts", label: "Open Receipts", to: "/finance/receipts", keywords: ["customer receipt", "supplier payment"], permissionAny: ["accounts.view", "sales.view", "purchases.view"] },
  { id: "hr", label: "Open HR", to: "/employees/registration", keywords: ["employees", "staff"], permissionAny: ["employees.view"] },
  { id: "reports", label: "Open Reports", to: "/reports", keywords: ["report center", "analytics"], permissionAny: ["reports.all"] },
  { id: "system", label: "Open System", to: "/system", keywords: ["users", "roles", "permissions"], permissionAny: ["users.view", "roles.view", "permissions.view", "system.users.manage", "system.roles.manage", "system.permissions.manage"] },
  { id: "settings", label: "Open Settings", to: "/settings", keywords: ["audit", "company"], permissionAny: ["system.settings"] },
];

const AppHeader: React.FC = () => {
  const [isApplicationMenuOpen, setApplicationMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleToggle = () => {
    if (window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  const toggleApplicationMenu = () => {
    setApplicationMenuOpen(!isApplicationMenuOpen);
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const hasAnyPerm = useCallback(
    (required?: string[]) => {
      if (!required || required.length === 0) return true;
      return required.some((perm) => permissions.includes(perm));
    },
    [permissions]
  );

  const availableCommands = useMemo(
    () => QUICK_COMMANDS.filter((command) => hasAnyPerm(command.permissionAny)),
    [hasAnyPerm]
  );

  const filteredCommands = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    const commands = availableCommands.filter((command) => command.to !== location.pathname);

    if (!query) return commands.slice(0, 8);

    return commands
      .filter((command) =>
        [command.label, command.to, ...command.keywords].join(" ").toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [availableCommands, location.pathname, searchValue]);

  const runCommand = useCallback(
    (command: QuickCommand) => {
      navigate(command.to);
      setSearchValue("");
      setIsSearchOpen(false);
      setActiveIndex(0);
    },
    [navigate]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setIsSearchOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!searchWrapRef.current?.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [searchValue, isSearchOpen]);

  return (
    <header className="sticky top-0 z-99999 flex w-full border-b border-[#2c6287] bg-gradient-to-r from-[#123f5c] to-[#1b5a80] text-white">
      <div className="grow lg:px-6">
        <div className="flex flex-col items-center justify-between lg:flex-row">
          <div className="flex w-full items-center justify-between gap-2 border-b border-[#2c6287]/80 px-3 py-3 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
            <button
              className="z-99999 h-10 w-10 items-center justify-center rounded-lg border border-[#3e7396] bg-[#0f4f76] text-[#dbeaf6] transition-colors hover:bg-[#0b4061] hover:text-white lg:flex lg:h-11 lg:w-11"
              onClick={handleToggle}
              aria-label="Toggle Sidebar"
            >
              {isMobileOpen ? (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                    fill="currentColor"
                  />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="12"
                  viewBox="0 0 16 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z"
                    fill="currentColor"
                  />
                </svg>
              )}
            </button>

            <Link to="/" className="lg:hidden inline-flex items-center gap-2 rounded-lg border border-[#3e7396] bg-[#0f4f76] px-2.5 py-2 text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#123f5c]">
                <ShoppingCart className="h-4 w-4" />
              </span>
              <span className="text-xs font-semibold tracking-wide">KeydMaal ERP</span>
            </Link>

            <button
              onClick={toggleApplicationMenu}
              className="z-99999 flex h-10 w-10 items-center justify-center rounded-lg border border-[#3e7396] bg-[#0f4f76] text-[#dbeaf6] transition-colors hover:bg-[#0b4061] hover:text-white lg:hidden"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M5.99902 10.4951C6.82745 10.4951 7.49902 11.1667 7.49902 11.9951V12.0051C7.49902 12.8335 6.82745 13.5051 5.99902 13.5051C5.1706 13.5051 4.49902 12.8335 4.49902 12.0051V11.9951C4.49902 11.1667 5.1706 10.4951 5.99902 10.4951ZM17.999 10.4951C18.8275 10.4951 19.499 11.1667 19.499 11.9951V12.0051C19.499 12.8335 18.8275 13.5051 17.999 13.5051C17.1706 13.5051 16.499 12.8335 16.499 12.0051V11.9951C16.499 11.1667 17.1706 10.4951 17.999 10.4951ZM13.499 11.9951C13.499 11.1667 12.8275 10.4951 11.999 10.4951C11.1706 10.4951 10.499 11.1667 10.499 11.9951V12.0051C10.499 12.8335 11.1706 13.5051 11.999 13.5051C12.8275 13.5051 13.499 12.8335 13.499 12.0051V11.9951Z"
                  fill="currentColor"
                />
              </svg>
            </button>

            <div className="hidden lg:block">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const candidate = filteredCommands[activeIndex] || filteredCommands[0];
                  if (candidate) runCommand(candidate);
                }}
              >
                <div ref={searchWrapRef} className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                    <svg
                      className="fill-[#b5d0e4]"
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
                        fill=""
                      />
                    </svg>
                  </span>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search or type command..."
                    value={searchValue}
                    onFocus={() => setIsSearchOpen(true)}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setIsSearchOpen(false);
                        return;
                      }
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        if (!isSearchOpen) setIsSearchOpen(true);
                        setActiveIndex((prev) => Math.min(prev + 1, Math.max(0, filteredCommands.length - 1)));
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveIndex((prev) => Math.max(prev - 1, 0));
                      }
                      if (e.key === "Enter") {
                        const candidate = filteredCommands[activeIndex] || filteredCommands[0];
                        if (candidate) {
                          e.preventDefault();
                          runCommand(candidate);
                        }
                      }
                    }}
                    className="h-11 w-full rounded-lg border border-[#3e7396] bg-[#0f4f76]/45 py-2.5 pl-12 pr-14 text-sm text-white shadow-theme-xs placeholder:text-[#b5d0e4] focus:border-[#9ec5df] focus:outline-hidden focus:ring-3 focus:ring-[#9ec5df]/25 xl:w-[430px]"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      inputRef.current?.focus();
                      setIsSearchOpen(true);
                    }}
                    className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-[#4b7ea2] bg-[#0f4f76] px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-[#dbeaf6]"
                  >
                    <span>Ctrl</span>
                    <span>K</span>
                  </button>

                  {isSearchOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[100000] overflow-hidden rounded-xl border border-[#3e7396] bg-[#0f4f76] shadow-2xl">
                      {filteredCommands.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-[#c7dfef]">No matching commands.</div>
                      ) : (
                        <ul className="max-h-80 overflow-auto py-1">
                          {filteredCommands.map((command, index) => (
                            <li key={command.id}>
                              <button
                                type="button"
                                onClick={() => runCommand(command)}
                                className={`w-full px-4 py-2.5 text-left text-sm transition ${
                                  index === activeIndex
                                    ? "bg-[#1b5a80] text-white"
                                    : "text-[#dbeaf6] hover:bg-[#1b5a80]/70"
                                }`}
                              >
                                <span className="block font-semibold">{command.label}</span>
                                <span className="block text-xs text-[#b5d0e4]">{command.to}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </form>
            </div>
          </div>
          <div className="flex items-center gap-4 px-3 py-2 lg:px-0 lg:py-0">
            <div className="flex items-center gap-2 2xsm:gap-3">
              <ThemeToggleButton />
              <NotificationDropdown />
            </div>
            <UserDropdown />
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
