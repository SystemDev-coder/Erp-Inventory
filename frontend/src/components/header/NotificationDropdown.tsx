import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Dropdown } from '../ui/dropdown/Dropdown';
import { useToast } from '../ui/toast/Toast';
import {
  notificationService,
  NotificationItem,
} from '../../services/notification.service';

const formatTimeAgo = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day ago`;

  return date.toLocaleDateString();
};

const initialsFromText = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('') || 'N';

const categoryDotClass = (category: string, isRead: boolean) => {
  if (isRead) return 'bg-slate-400';

  switch (category) {
    case 'inventory':
      return 'bg-emerald-500';
    case 'purchase':
      return 'bg-blue-500';
    case 'finance':
      return 'bg-amber-500';
    default:
      return 'bg-brand-500';
  }
};

const normalizeNotificationLink = (rawLink: string | null) => {
  if (!rawLink) return null;

  const link = rawLink.trim();
  if (!link) return null;

  const legacyMap: Record<string, string> = {
    '/inventory/stock': '/stock-management/items',
    '/stock': '/stock-management/items',
  };

  return legacyMap[link] ?? link;
};

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const loadNotifications = useCallback(
    async (withLoader: boolean) => {
      if (withLoader) setLoading(true);
      const res = await notificationService.list({ limit: 12, offset: 0 });
      if (res.success && res.data) {
        setNotifications(res.data.notifications ?? []);
        setUnreadCount(res.data.unreadCount ?? 0);
      } else if (withLoader) {
        showToast('error', 'Load failed', res.error ?? res.message ?? 'Could not load notifications');
      }
      if (withLoader) setLoading(false);
    },
    [showToast]
  );

  useEffect(() => {
    void loadNotifications(false);
    const timer = setInterval(() => {
      void loadNotifications(false);
    }, 60000);

    return () => clearInterval(timer);
  }, [loadNotifications]);

  const toggleDropdown = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      void loadNotifications(true);
    }
  };

  const closeDropdown = () => {
    setIsOpen(false);
  };

  const handleMarkAllRead = async () => {
    if (!unreadCount || busy) return;
    setBusy(true);

    const res = await notificationService.markAllRead();
    if (res.success) {
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((row) => ({
          ...row,
          is_read: true,
          read_at: row.read_at ?? now,
        }))
      );
      setUnreadCount(0);
    } else {
      showToast('error', 'Update failed', res.error ?? res.message ?? 'Could not update notifications');
    }

    setBusy(false);
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.is_read) {
      const res = await notificationService.markRead(notification.notification_id);
      if (res.success) {
        setNotifications((prev) =>
          prev.map((row) =>
            row.notification_id === notification.notification_id
              ? { ...row, is_read: true, read_at: row.read_at ?? new Date().toISOString() }
              : row
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } else {
        showToast('error', 'Update failed', res.error ?? res.message ?? 'Could not mark notification');
      }
    }

    closeDropdown();
    const targetLink = normalizeNotificationLink(notification.link);
    if (targetLink) {
      navigate(targetLink);
    }
  };

  return (
    <div className="relative">
      <button
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full dropdown-toggle hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={toggleDropdown}
        aria-label="Notifications"
      >
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0.5 z-10 min-w-2.5 h-2.5 rounded-full bg-orange-400">
            <span className="absolute inline-flex w-full h-full bg-orange-400 rounded-full opacity-75 animate-ping"></span>
          </span>
        )}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-theme-lg dark:border-slate-700 dark:bg-slate-800 sm:w-[361px] lg:right-0"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h5 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Notification
            </h5>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {unreadCount} unread
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                disabled={busy}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60 dark:text-brand-400"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={toggleDropdown}
              className="text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <svg
                className="fill-current"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>

        <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
          {loading ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading notifications...
            </li>
          ) : notifications.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No notifications yet.
            </li>
          ) : (
            notifications.map((notification) => (
              <li key={notification.notification_id}>
                <button
                  type="button"
                  onClick={() => void handleNotificationClick(notification)}
                  className={`flex w-full gap-3 rounded-lg border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700 ${
                    notification.is_read ? '' : 'bg-brand-50/40 dark:bg-brand-500/10'
                  }`}
                >
                  <span className="relative block h-10 w-10 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700">
                    <span className="flex h-10 w-10 items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-100">
                      {initialsFromText(notification.created_by_name || notification.title)}
                    </span>
                    <span
                      className={`absolute bottom-0 right-0 z-10 h-2.5 w-2.5 rounded-full border-[1.5px] border-white dark:border-slate-800 ${categoryDotClass(
                        notification.category,
                        notification.is_read
                      )}`}
                    ></span>
                  </span>

                  <span className="block">
                    <span className="mb-1 block text-theme-sm text-slate-700 dark:text-slate-200">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {notification.title}
                      </span>
                    </span>
                    <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                      {notification.message}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="capitalize">{notification.category}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-400"></span>
                      <span>{formatTimeAgo(notification.created_at)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <Link
          to="/settings"
          onClick={closeDropdown}
          className="block px-4 py-2 mt-3 text-sm font-medium text-center text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          View All Notifications
        </Link>
      </Dropdown>
    </div>
  );
}
