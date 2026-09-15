import { useState } from "react";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { User, UserCog, Settings, History, Lock, LogOut } from "lucide-react";
import { UserProfileModal } from "./UserProfileModal";
import { UserProfileViewModal } from "./UserProfileViewModal";

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewProfileOpen, setViewProfileOpen] = useState(false);
  const { user, permissions, logout, lock } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const canManageSettings = !!user?.is_admin || permissions.includes("system.settings");

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  async function handleSignOut() {
    closeDropdown();
    await logout();
    navigate("/signin");
  }

  const displayName = user?.name ?? "User";
  const displaySub = user?.role_name || user?.username || "-";

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="dropdown-toggle flex items-center text-slate-900 hover:opacity-90 dark:text-white"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="mr-3 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-black text-white dark:border-white/15 dark:bg-white dark:text-black">
          {user?.name ? (
            <span className="text-sm font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </span>
          ) : (
            <User className="h-5 w-5" />
          )}
        </span>
        <span className="mr-1 block max-w-[120px] truncate text-theme-sm font-medium text-slate-900 dark:text-white">
          {displayName.split(" ")[0] || "User"}
        </span>
        <svg
          className={`shrink-0 text-slate-600 transition-transform duration-200 dark:text-white/80 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="18"
          height="20"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-theme-lg dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-black text-white dark:border-white/15 dark:bg-white dark:text-black">
            {user?.name ? (
              <span className="text-base font-semibold">{user.name.charAt(0).toUpperCase()}</span>
            ) : (
              <User className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0">
            <span className="block truncate text-theme-sm font-semibold text-slate-900 dark:text-slate-100">
              {displayName}
            </span>
            <span className="mt-0.5 block truncate text-theme-xs text-slate-500 dark:text-slate-400">
              {displaySub}
            </span>
          </div>
        </div>

        <ul className="flex flex-col gap-1 border-b border-slate-200 pb-3 pt-3 dark:border-slate-700">
          <li>
            <DropdownItem
              onItemClick={() => {
                closeDropdown();
                setViewProfileOpen(true);
              }}
              tag="button"
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
            >
              <User className="h-5 w-5 text-slate-500 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100" />
              {t("view_profile")}
            </DropdownItem>
          </li>
          <li>
            <DropdownItem
              onItemClick={() => {
                closeDropdown();
                setProfileOpen(true);
              }}
              tag="button"
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
            >
              <UserCog className="h-5 w-5 text-slate-500 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100" />
              {t("edit_profile")}
            </DropdownItem>
          </li>
          {canManageSettings && (
            <li>
              <DropdownItem
                onItemClick={() => {
                  closeDropdown();
                  navigate("/settings");
                }}
                tag="button"
                className="group flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
              >
                <Settings className="h-5 w-5 text-slate-500 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100" />
                {t("account_settings")}
              </DropdownItem>
            </li>
          )}
          {canManageSettings && (
            <li>
              <DropdownItem
                onItemClick={() => {
                  closeDropdown();
                  // NOTE: the Settings.tsx page (Capital/Assets/Activity Logs tabs) is
                  // mounted at the "/system" route; "/settings" renders the System.tsx
                  // page (Users/Roles/Privileges) instead - route names are swapped.
                  navigate("/system?tab=activity-logs");
                }}
                tag="button"
                className="group flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
              >
                <History className="h-5 w-5 text-slate-500 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100" />
                {t("activity_logs")}
              </DropdownItem>
            </li>
          )}
          <li>
            <DropdownItem
              onItemClick={() => {
                closeDropdown();
                lock();
                navigate("/lock");
              }}
              tag="button"
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
            >
              <Lock className="h-5 w-5 text-slate-500 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100" />
              {t("lock_screen")}
            </DropdownItem>
          </li>
        </ul>
        <button
          type="button"
          onClick={handleSignOut}
          className="group mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-theme-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <LogOut className="h-5 w-5 text-red-500 group-hover:text-red-600 dark:text-red-400" />
          {t("log_out")}
        </button>
      </Dropdown>

      <UserProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        initial={user as any}
      />
      <UserProfileViewModal isOpen={viewProfileOpen} onClose={() => setViewProfileOpen(false)} />
    </div>
  );
}
