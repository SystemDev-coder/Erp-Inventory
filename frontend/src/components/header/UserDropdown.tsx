import { useState } from "react";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { useNavigate } from "react-router";
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
  const displaySub = user?.username || user?.phone || user?.role_name || "-";

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
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-[#9bb3d5] bg-[#fbfcff] p-3 shadow-theme-lg dark:border-[#264676] dark:bg-[#10233f]"
      >
        <div className="border-b border-[#d5e0f0] pb-3 dark:border-[#264676]">
          <span className="block text-theme-sm font-medium text-[#0a1f44] dark:text-[#f4f8ff]">
            {displayName}
          </span>
          <span className="mt-0.5 block text-theme-xs text-[#6f86a8] dark:text-[#9fc3da]">
            {displaySub}
          </span>
          {user?.role_name && (
            <span className="mt-1 inline-block rounded-md bg-[#edf2fa] px-2 py-0.5 text-theme-xs text-[#163a72] dark:bg-[#102b59]/35 dark:text-[#9fc3da]">
              {user.role_name}
            </span>
          )}
        </div>

        <ul className="flex flex-col gap-1 border-b border-[#d5e0f0] pb-3 pt-4 dark:border-[#264676]">
          <li>
            <DropdownItem
              onItemClick={() => {
                closeDropdown();
                setProfileOpen(true);
              }}
              tag="button"
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-[#2b4558] hover:bg-[#f4f7fd] dark:text-[#dde7f7] dark:hover:bg-[#102b59]/35"
            >
              <User className="h-5 w-5 text-[#6f86a8] group-hover:text-[#0a1f44] dark:text-[#9fc3da] dark:group-hover:text-[#f4f8ff]" />
              Edit profile
            </DropdownItem>
          </li>
          <li>
            {user?.role_name === "Admin" && (
              <DropdownItem
                onItemClick={() => {
                  closeDropdown();
                  navigate("/settings");
                }}
                tag="button"
                className="group flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-[#2b4558] hover:bg-[#f4f7fd] dark:text-[#dde7f7] dark:hover:bg-[#102b59]/35"
              >
                <Settings className="h-5 w-5 text-[#6f86a8] group-hover:text-[#0a1f44] dark:text-[#9fc3da] dark:group-hover:text-[#f4f8ff]" />
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
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-[#2b4558] hover:bg-[#f4f7fd] dark:text-[#dde7f7] dark:hover:bg-[#102b59]/35"
            >
              <HelpCircle className="h-5 w-5 text-[#6f86a8] group-hover:text-[#0a1f44] dark:text-[#9fc3da] dark:group-hover:text-[#f4f8ff]" />
              Support
            </DropdownItem>
          </li>
        </ul>
        <button
          type="button"
          onClick={handleSignOut}
          className="group mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-theme-sm font-medium text-[#2b4558] hover:bg-[#f4f7fd] dark:text-[#dde7f7] dark:hover:bg-[#102b59]/35"
        >
          <LogOut className="h-5 w-5 text-[#6f86a8] group-hover:text-[#0a1f44] dark:text-[#9fc3da] dark:group-hover:text-[#f4f8ff]" />
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
