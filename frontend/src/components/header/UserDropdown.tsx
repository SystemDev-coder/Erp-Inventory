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
        className="dropdown-toggle flex items-center text-[#e7f2fb] hover:opacity-90"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="mr-3 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#4b7ea2] bg-[#0f4f76]">
          {user?.name ? (
            <span className="text-sm font-semibold text-[#dbeaf6]">
              {user.name.charAt(0).toUpperCase()}
            </span>
          ) : (
            <User className="h-5 w-5 text-[#dbeaf6]" />
          )}
        </span>
        <span className="mr-1 block max-w-[120px] truncate text-theme-sm font-medium text-[#e7f2fb]">
          {displayName.split(" ")[0] || "User"}
        </span>
        <svg
          className={`shrink-0 text-[#dbeaf6] transition-transform duration-200 ${
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
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-[#b7cde0] bg-[#f8fbfe] p-3 shadow-theme-lg dark:border-[#2c6287] dark:bg-[#12344c]"
      >
        <div className="border-b border-[#d0dfeb] pb-3 dark:border-[#2c6287]">
          <span className="block text-theme-sm font-medium text-[#123f5c] dark:text-[#e7f2fb]">
            {displayName}
          </span>
          <span className="mt-0.5 block text-theme-xs text-[#57748c] dark:text-[#9fc3da]">
            {displaySub}
          </span>
          {user?.role_name && (
            <span className="mt-1 inline-block rounded-md bg-[#e6f0f8] px-2 py-0.5 text-theme-xs text-[#0f4f76] dark:bg-[#1b5a80]/35 dark:text-[#9fc3da]">
              {user.role_name}
            </span>
          )}
        </div>

        <ul className="flex flex-col gap-1 border-b border-[#d0dfeb] pb-3 pt-4 dark:border-[#2c6287]">
          <li>
            <DropdownItem
              onItemClick={() => {
                closeDropdown();
                setProfileOpen(true);
              }}
              tag="button"
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-[#2b4558] hover:bg-[#edf5fb] dark:text-[#cfe3f1] dark:hover:bg-[#1b5a80]/35"
            >
              <User className="h-5 w-5 text-[#57748c] group-hover:text-[#123f5c] dark:text-[#9fc3da] dark:group-hover:text-[#e7f2fb]" />
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
                className="group flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-[#2b4558] hover:bg-[#edf5fb] dark:text-[#cfe3f1] dark:hover:bg-[#1b5a80]/35"
              >
                <Settings className="h-5 w-5 text-[#57748c] group-hover:text-[#123f5c] dark:text-[#9fc3da] dark:group-hover:text-[#e7f2fb]" />
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
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-[#2b4558] hover:bg-[#edf5fb] dark:text-[#cfe3f1] dark:hover:bg-[#1b5a80]/35"
            >
              <HelpCircle className="h-5 w-5 text-[#57748c] group-hover:text-[#123f5c] dark:text-[#9fc3da] dark:group-hover:text-[#e7f2fb]" />
              Support
            </DropdownItem>
          </li>
        </ul>
        <button
          type="button"
          onClick={handleSignOut}
          className="group mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-theme-sm font-medium text-[#2b4558] hover:bg-[#edf5fb] dark:text-[#cfe3f1] dark:hover:bg-[#1b5a80]/35"
        >
          <LogOut className="h-5 w-5 text-[#57748c] group-hover:text-[#123f5c] dark:text-[#9fc3da] dark:group-hover:text-[#e7f2fb]" />
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
