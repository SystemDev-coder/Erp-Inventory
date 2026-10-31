import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, ChevronLeft, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { useToast } from '../../components/ui/toast/Toast';
import { useBranch } from '../../context/BranchContext';
import { notificationService, NotificationItem } from '../../services/notification.service';
import {
  categoryIconConfig,
  avatarColorFor,
  formatTimeAgo,
  initialsFromText,
  normalizeNotificationLink,
  renderHighlightedMessage,
} from '../../utils/notificationDisplay';

const PAGE_SIZE = 20;

// The full notification list - reuses the exact same GET/PATCH/DELETE endpoints and
// row styling as the header bell dropdown (NotificationDropdown.tsx), just with real
// pagination instead of a hardcoded 12-item cap, and a dismiss action wired up to the
// DELETE endpoint that already existed server-side but had no frontend caller before.
export const NotificationsTab = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissTarget, setDismissTarget] = useState<NotificationItem | null>(null);
  const [dismissing, setDismissing] = useState(false);

  const load = useCallback(
    async (nextPage: number, unreadOnly: boolean) => {
      setLoading(true);
      const res = await notificationService.list({
        limit: PAGE_SIZE,
        offset: nextPage * PAGE_SIZE,
        unreadOnly,
        branchId: activeBranchId ?? undefined,
      });
      if (res.success && res.data) {
        setNotifications(res.data.notifications ?? []);
        setTotal(res.data.total ?? 0);
        setUnreadCount(res.data.unreadCount ?? 0);
      } else {
        showToast('error', 'Load failed', res.error ?? res.message ?? 'Could not load notifications');
      }
      setLoading(false);
    },
    [activeBranchId, showToast]
  );

  useEffect(() => {
    setPage(0);
    void load(0, onlyUnread);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  const handleToggleOnlyUnread = () => {
    const next = !onlyUnread;
    setOnlyUnread(next);
    setPage(0);
    void load(0, next);
  };

  const handleMarkAllRead = async () => {
    if (!unreadCount || busy) return;
    setBusy(true);
    const res = await notificationService.markAllRead();
    if (res.success) {
      showToast('success', 'Notifications', 'All notifications marked as read');
      await load(page, onlyUnread);
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

    const targetLink = normalizeNotificationLink(notification.link);
    if (targetLink) navigate(targetLink);
  };

  const confirmDismiss = async (reason?: string) => {
    if (!dismissTarget || !reason) return;
    setDismissing(true);
    const res = await notificationService.remove(dismissTarget.notification_id, reason);
    if (res.success) {
      showToast('success', 'Notifications', 'Notification dismissed');
      setDismissTarget(null);
      await load(page, onlyUnread);
    } else {
      showToast('error', 'Dismiss failed', res.error ?? res.message ?? 'Could not dismiss notification');
    }
    setDismissing(false);
  };

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    void load(nextPage, onlyUnread);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => void load(page, onlyUnread)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Loading...' : 'Refresh'}
          </button>
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
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
        </div>
        <button
          type="button"
          onClick={() => void handleMarkAllRead()}
          disabled={!unreadCount || busy}
          className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:text-slate-100"
        >
          Mark all as read ({unreadCount})
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-300">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-300">
            <Bell className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            {onlyUnread ? 'No unread notifications.' : 'No notifications yet.'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((notification) => {
              const config = categoryIconConfig[notification.category] ?? categoryIconConfig.default;
              const Icon = config.icon;
              const hasActor = !!notification.created_by_name;
              const avatarLabel = notification.created_by_name || notification.title;

              return (
                <li key={notification.notification_id} className={`flex items-start gap-3 px-4 py-3 ${notification.is_read ? '' : 'bg-slate-50/70 dark:bg-slate-800/40'}`}>
                  <button
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    className="flex min-w-0 flex-1 gap-3 text-left"
                  >
                    {hasActor ? (
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColorFor(avatarLabel)}`}>
                        {initialsFromText(avatarLabel)}
                      </span>
                    ) : (
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.bg}`}>
                        <Icon className={`h-5 w-5 ${config.iconColor}`} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {notification.title}
                          {!notification.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-xs text-slate-400 dark:text-slate-500">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm leading-snug text-slate-500 dark:text-slate-300">
                        {renderHighlightedMessage(notification.message)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissTarget(notification)}
                    title="Dismiss"
                    aria-label="Dismiss notification"
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 dark:hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>
              Page {page + 1} of {totalPages} ({total} total)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page === 0 || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page + 1 >= totalPages || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!dismissTarget}
        onClose={() => { if (!dismissing) setDismissTarget(null); }}
        onConfirm={(reason) => void confirmDismiss(reason)}
        requireReason
        title="Dismiss Notification?"
        highlightedName={dismissTarget?.title}
        message="This removes the notification from your list. Provide a reason for the audit log."
        confirmText="Dismiss"
        cancelText="Cancel"
        variant="danger"
        isLoading={dismissing}
      />
    </div>
  );
};

export default NotificationsTab;
