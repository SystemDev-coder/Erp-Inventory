import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, Package, ShoppingCart, Wallet, X } from 'lucide-react';
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
  if (diffMin < 60) return `${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hr`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day`;

  return date.toLocaleDateString();
};

const initialsFromText = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('') || 'N';

const categoryIconConfig: Record<string, { icon: typeof Bell; bg: string; iconColor: string }> = {
  inventory: {
    icon: Package,
    bg: 'bg-amber-100 dark:bg-amber-500/15',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  finance: {
    icon: Wallet,
    bg: 'bg-emerald-100 dark:bg-emerald-500/15',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  purchase: {
    icon: ShoppingCart,
    bg: 'bg-blue-100 dark:bg-blue-500/15',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  default: {
    icon: Bell,
    bg: 'bg-primary-100 dark:bg-primary-500/15',
    iconColor: 'text-primary-600 dark:text-primary-400',
  },
};

const avatarPalette = [
  'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
];

const avatarColorFor = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return avatarPalette[hash % avatarPalette.length];
};

// Highlights quoted phrases ('...'), reference tokens (#SO-2345), and
// dollar amounts inside a notification message, mirroring the reference
// design's colored call-outs, without needing extra fields from the backend.
const HIGHLIGHT_PATTERN = /('[^']+'|"[^"]+"|#[\w-]+|\$[\d,]+(?:\.\d+)?)/g;

const renderHighlightedMessage = (message: string) => {
  // message.split() with a single capturing group puts matches at odd
  // indices and plain text at even indices - no need to re-test the regex
  // (which would be unsafe here anyway since it carries the `g` flag and
  // .test() mutates its shared lastIndex across calls).
  const parts = message.split(HIGHLIGHT_PATTERN);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="font-medium text-primary-600 dark:text-primary-400">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    )
  );
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
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const loadNotifications = useCallback(
    async (withLoader: boolean, unreadOnly: boolean) => {
      if (withLoader) setLoading(true);
      const res = await notificationService.list({ limit: 12, offset: 0, unreadOnly });
      if (res.success && res.data) {
        setNotifications(res.data.notifications ?? []);
        setUnreadCount(res.data.unreadCount ?? 0);
        setTotalCount(res.data.total ?? res.data.notifications?.length ?? 0);
      } else if (withLoader) {
        showToast('error', 'Load failed', res.error ?? res.message ?? 'Could not load notifications');
      }
      if (withLoader) setLoading(false);
    },
    [showToast]
  );

  useEffect(() => {
    void loadNotifications(false, false);
    const timer = setInterval(() => {
      void loadNotifications(false, onlyUnread);
    }, 60000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadNotifications]);

  const toggleDropdown = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      void loadNotifications(true, onlyUnread);
    }
  };

  const closeDropdown = () => {
    setIsOpen(false);
  };

  const handleToggleOnlyUnread = () => {
    const next = !onlyUnread;
    setOnlyUnread(next);
    void loadNotifications(true, next);
  };

  const handleMarkAllRead = async () => {
    if (!unreadCount || busy) return;
    setBusy(true);

    const res = await notificationService.markAllRead();
    if (res.success) {
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev
          .map((row) => ({
            ...row,
            is_read: true,
            read_at: row.read_at ?? now,
          }))
          .filter((row) => !onlyUnread || !row.is_read)
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

  const badgeCount = totalCount > 0 ? totalCount : unreadCount;
  const unreadBadge = badgeCount > 99 ? '99+' : String(badgeCount);

  return (
    <div className="relative">
      <button
        className="dropdown-toggle relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/15 dark:bg-black dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
        onClick={toggleDropdown}
        aria-label="Notifications"
      >
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 z-10 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadBadge}
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
        className="absolute -right-[240px] mt-[17px] flex max-h-[480px] w-[350px] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-theme-lg dark:border-slate-700 dark:bg-slate-900 sm:w-[361px] lg:right-0"
      >
        <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
          <h5 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Notifications
          </h5>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Only Unread
              <button
                type="button"
                role="switch"
                aria-checked={onlyUnread}
                onClick={handleToggleOnlyUnread}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  onlyUnread ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    onlyUnread ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
            <button
              onClick={closeDropdown}
              aria-label="Close"
              className="text-slate-400 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <ul className="flex h-auto flex-col overflow-y-auto custom-scrollbar">
          {loading ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-300">
              Loading notifications...
            </li>
          ) : notifications.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-300">
              {onlyUnread ? 'No unread notifications.' : 'No notifications yet.'}
            </li>
          ) : (
            notifications.map((notification) => {
              const config = categoryIconConfig[notification.category] ?? categoryIconConfig.default;
              const Icon = config.icon;
              const hasActor = !!notification.created_by_name;
              const avatarLabel = notification.created_by_name || notification.title;

              return (
                <li key={notification.notification_id}>
                  <button
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    className={`flex w-full gap-3 rounded-xl border-b border-slate-100 px-2 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60 ${
                      notification.is_read ? '' : 'bg-slate-50/70 dark:bg-slate-800/40'
                    }`}
                  >
                    {hasActor ? (
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColorFor(
                          avatarLabel
                        )}`}
                      >
                        {initialsFromText(avatarLabel)}
                      </span>
                    ) : (
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.bg}`}
                      >
                        <Icon className={`h-5 w-5 ${config.iconColor}`} />
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-theme-sm font-semibold text-slate-900 dark:text-slate-100">
                          {notification.title}
                          {!notification.is_read && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                          )}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-500 dark:text-slate-300">
                        {renderHighlightedMessage(notification.message)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            disabled={!unreadCount || busy}
            className="font-medium text-slate-600 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:text-slate-100"
          >
            Mark all as read
          </button>
          <Link
            to="/settings"
            onClick={closeDropdown}
            className="font-medium text-primary-600 transition hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            View all Notifications
          </Link>
        </div>
      </Dropdown>
    </div>
  );
}
