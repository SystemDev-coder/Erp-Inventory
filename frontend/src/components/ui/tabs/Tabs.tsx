import React, { useId, useRef, useState } from 'react';
import { LucideIcon } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
}

/**
 * Enterprise-grade tabs.
 *
 * Visual philosophy:
 *  - Light mode: soft blue-50 tint on the active tab, no harsh solid fills.
 *  - Dark mode: nearly-black container (slate-950) with a *translucent*
 *    blue wash on the active tab (blue-500/10) — "watery", low-opacity,
 *    never saturated. Text stays blue-300 for readable-but-calm contrast.
 *  - No gradients, no neumorphism, no floating pills outside the container.
 *  - Matches the Lock screen: same blue accent, same rounded corners,
 *    same focus ring treatment.
 */
export const Tabs: React.FC<TabsProps> = ({ tabs, defaultTab, onChange }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  const focusTabAt = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    tabRefs.current[next]?.focus();
    handleTabChange(tabs[next].id);
  };

  const activeTabContent = tabs.find((tab) => tab.id === activeTab)?.content;

  return (
    <div className="w-full">
      {/* Container: clean surface in light mode, near-black in dark mode.
          A hairline border keeps it from floating in the void. */}
      <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800/70 dark:bg-slate-950">
        <div
          className="no-scrollbar flex gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Sections"
        >
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const tabId = `${baseId}-tab-${tab.id}`;
            const panelId = `${baseId}-panel-${tab.id}`;

            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                onClick={() => handleTabChange(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    focusTabAt(index + 1);
                  } else if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    focusTabAt(index - 1);
                  } else if (event.key === 'Home') {
                    event.preventDefault();
                    focusTabAt(0);
                  } else if (event.key === 'End') {
                    event.preventDefault();
                    focusTabAt(tabs.length - 1);
                  }
                }}
                className={[
                  // Layout
                  'group relative flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2',
                  'text-sm font-medium transition-colors duration-150',
                  // Focus ring — keyboard only, offset colors themed per mode
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                  'dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950',
                  // ── Active: translucent blue wash, weak strength, no solid fill ──
                  isActive
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/70 ' +
                      'dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20'
                    : // ── Inactive: muted, subtle hover surface ──
                      'text-slate-600 hover:bg-slate-100 hover:text-slate-900 ' +
                      'dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100',
                ].join(' ')}
              >
                {Icon && (
                  <Icon
                    className={[
                      'h-4 w-4 shrink-0 transition-colors duration-150',
                      isActive
                        ? 'text-blue-600 dark:text-blue-300'
                        : 'text-slate-400 group-hover:text-slate-600 ' +
                          'dark:text-slate-500 dark:group-hover:text-slate-300',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                )}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={[
                      'ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5',
                      'text-[11px] font-semibold leading-none',
                      isActive
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                    ].join(' ')}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          className="mt-6"
        >
          {activeTab === tab.id ? activeTabContent : null}
        </div>
      ))}
    </div>
  );
};