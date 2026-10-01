import { Bell, Package, ShoppingCart, Wallet } from 'lucide-react';

// Shared between the notification bell dropdown (NotificationDropdown.tsx) and the
// full "Notifications" tab (pages/System/NotificationsTab.tsx) - both render the same
// notification rows and should look identical, not drift into two implementations.

export const formatTimeAgo = (value: string) => {
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

export const initialsFromText = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('') || 'N';

export const categoryIconConfig: Record<string, { icon: typeof Bell; bg: string; iconColor: string }> = {
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

export const avatarColorFor = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return avatarPalette[hash % avatarPalette.length];
};

// Highlights quoted phrases ('...'), reference tokens (#SO-2345), and
// dollar amounts inside a notification message, mirroring the reference
// design's colored call-outs, without needing extra fields from the backend.
const HIGHLIGHT_PATTERN = /('[^']+'|"[^"]+"|#[\w-]+|\$[\d,]+(?:\.\d+)?)/g;

export const renderHighlightedMessage = (message: string) => {
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

export const normalizeNotificationLink = (rawLink: string | null) => {
  if (!rawLink) return null;

  const link = rawLink.trim();
  if (!link) return null;

  const legacyMap: Record<string, string> = {
    '/inventory/stock': '/stock-management/items',
    '/stock': '/stock-management/items',
  };

  return legacyMap[link] ?? link;
};
