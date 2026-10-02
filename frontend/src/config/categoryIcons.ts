import {
  Headphones, Footprints, Smartphone, Watch, Laptop, Store, Lightbulb,
  Sparkles, Shirt, Utensils, Pill, Car, Home, Gift, ShoppingBag, Wrench,
  BookOpen, Boxes, type LucideIcon,
} from 'lucide-react';

export interface CategoryIconOption {
  key: string;
  label: string;
  Icon: LucideIcon;
  className: string;
}

// Curated, fixed set - this app has no dynamic icon-name resolution anywhere
// (every file imports only the specific lucide icons it uses), so category
// icons are picked from this list rather than an arbitrary name/upload. The
// first 7 are exactly POSTab.tsx's old CATEGORY_LOOKS pairing (icon + color),
// kept unchanged so existing icon-less categories keep rendering identically
// via the fallback rotation below; the rest cover other business types this
// app already supports (perfume, clothing, food, pharmacy, etc.).
export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { key: 'Headphones', label: 'Audio', Icon: Headphones, className: 'text-purple-500' },
  { key: 'Footprints', label: 'Shoes', Icon: Footprints, className: 'text-orange-500' },
  { key: 'Smartphone', label: 'Phones', Icon: Smartphone, className: 'text-pink-500' },
  { key: 'Watch', label: 'Watches', Icon: Watch, className: 'text-amber-500' },
  { key: 'Laptop', label: 'Computers', Icon: Laptop, className: 'text-primary-500' },
  { key: 'Store', label: 'General Store', Icon: Store, className: 'text-emerald-500' },
  { key: 'Lightbulb', label: 'Electrical', Icon: Lightbulb, className: 'text-yellow-500' },
  { key: 'Sparkles', label: 'Perfume / Beauty', Icon: Sparkles, className: 'text-fuchsia-500' },
  { key: 'Shirt', label: 'Clothing', Icon: Shirt, className: 'text-sky-500' },
  { key: 'Utensils', label: 'Food', Icon: Utensils, className: 'text-rose-500' },
  { key: 'Pill', label: 'Pharmacy', Icon: Pill, className: 'text-teal-500' },
  { key: 'Car', label: 'Automotive', Icon: Car, className: 'text-slate-500' },
  { key: 'Home', label: 'Home Goods', Icon: Home, className: 'text-lime-600' },
  { key: 'Gift', label: 'Gifts', Icon: Gift, className: 'text-red-500' },
  { key: 'ShoppingBag', label: 'Retail', Icon: ShoppingBag, className: 'text-indigo-500' },
  { key: 'Wrench', label: 'Tools', Icon: Wrench, className: 'text-zinc-500' },
  { key: 'BookOpen', label: 'Books / Stationery', Icon: BookOpen, className: 'text-cyan-600' },
  { key: 'Boxes', label: 'General', Icon: Boxes, className: 'text-blue-500' },
];

const byKey = new Map(CATEGORY_ICON_OPTIONS.map((opt) => [opt.key, opt]));

// Returns the chosen icon for a category, or - for a category with no icon
// set yet (every category before this feature existed) - the same
// deterministic index-rotation POSTab.tsx always used, so nothing already on
// screen changes until someone actually picks an icon.
export const resolveCategoryIcon = (
  icon: string | null | undefined,
  fallbackIndex: number
): CategoryIconOption => {
  if (icon) {
    const match = byKey.get(icon);
    if (match) return match;
  }
  return CATEGORY_ICON_OPTIONS[fallbackIndex % CATEGORY_ICON_OPTIONS.length];
};
