import { useState } from "react";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { User, Settings, HelpCircle, LogOut } from "lucide-react";
import { UserProfileModal } from "./UserProfileModal";

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
  const displaySub = user?.username || user?.phone || user?.role_name || "—";

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center dropdown-toggle text-slate-700 dark:text-slate-200 hover:opacity-90"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="mr-3 overflow-hidden rounded-full h-11 w-11 bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
          {user?.name ? (
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {user.name.charAt(0).toUpperCase()}
            </span>
          ) : (
            <User className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          )}
        </span>
        <span className="block mr-1 font-medium text-theme-sm text-slate-800 dark:text-slate-100 truncate max-w-[120px]">
          {displayName.split(" ")[0] || "User"}
        </span>
        <svg
          className={`shrink-0 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
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
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-theme-lg dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="pb-3 border-b border-slate-200 dark:border-slate-700">
          <span className="block font-medium text-theme-sm text-slate-800 dark:text-slate-100">
            {displayName}
          </span>
          <span className="mt-0.5 block text-theme-xs text-slate-500 dark:text-slate-400">
            {displaySub}
          </span>
          {user?.role_name && (
            <span className="mt-1 inline-block text-theme-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              {user.role_name}
            </span>
          )}
        </div>

        <ul className="flex flex-col gap-1 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700">
          <li>
            <DropdownItem
              onItemClick={() => {
                closeDropdown();
                setProfileOpen(true);
              }}
              tag="button"
              className="flex items-center gap-3 px-3 py-2 font-medium rounded-lg group text-theme-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <User className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
              Edit profile
            </DropdownItem>
          </li>
          <li>
            {user?.role_name === 'Admin' && (
              <DropdownItem
                onItemClick={() => {
                  closeDropdown();
                  navigate("/settings");
                }}
                tag="button"
                className="flex items-center gap-3 px-3 py-2 font-medium rounded-lg group text-theme-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Settings className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
                Account settings
              </DropdownItem>
            )}
          </li>
          <li>
            <DropdownItem
              onItemClick={() => {
                closeDropdown();
                navigate("/support");
              }}
              tag="button"
              className="flex items-center gap-3 px-3 py-2 font-medium rounded-lg group text-theme-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <HelpCircle className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
              Support
            </DropdownItem>
          </li>
        </ul>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 mt-3 font-medium rounded-lg group text-theme-sm w-full text-left text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <LogOut className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
          Sign out
        </button>
      </Dropdown>

      <UserProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        initial={user as any}
      />
    </div>
  );
}
