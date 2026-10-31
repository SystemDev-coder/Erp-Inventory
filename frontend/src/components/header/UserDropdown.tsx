import { useState } from "react";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { User, UserCog, Settings, History, Lock, LogOut, AlertTriangle, X } from "lucide-react";
import { UserProfileModal } from "./UserProfileModal";
import { UserProfileViewModal } from "./UserProfileViewModal";

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewProfileOpen, setViewProfileOpen] = useState(false);
  // Confirmation dialog shown before the user is actually signed out.
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
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

  // Step 1: user clicks "Log out" — just open the confirmation, do NOT log out yet.
  function requestSignOut() {
    closeDropdown();
    setLogoutConfirmOpen(true);
  }

  // Step 2: user confirms in the dialog — now actually log out.
  async function confirmSignOut() {
    setLogoutConfirmOpen(false);
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
        <span className="block max-w-[120px] truncate text-theme-sm font-medium text-slate-900 dark:text-white">
          {displayName.split(" ")[0] || "User"}
        </span>
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
          onClick={requestSignOut}
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

      {/* ── Logout confirmation dialog ──────────────────────────────────
          Inline (no external dependency), themed for light + dark mode,
          accessible (role=dialog, escape-to-close, backdrop click). */}
      {logoutConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-confirm-title"
          aria-describedby="logout-confirm-body"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
        >
          {/* Backdrop */}
          <div
            onClick={() => setLogoutConfirmOpen(false)}
            aria-hidden="true"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-slate-950/70"
          />

          {/* Card */}
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>

            <h3
              id="logout-confirm-title"
              className="text-center text-lg font-semibold text-slate-900 dark:text-white"
            >
              {t("log_out")}?
            </h3>
            <p
              id="logout-confirm-body"
              className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              You will be signed out and will need to log in again to continue.
            </p>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmSignOut()}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-red-500 dark:hover:bg-red-400 dark:focus-visible:ring-offset-slate-900"
              >
                {t("log_out")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}