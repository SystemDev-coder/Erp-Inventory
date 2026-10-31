import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const getFocusable = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0
  );

export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onEscape?: () => void
) {
  // Auto-focus the first focusable element exactly once per "opened" transition. This is
  // deliberately its own effect, keyed only on `active`/`containerRef` (both stable across
  // re-renders) - NOT on `onEscape`. Several callers pass an inline onClose/onEscape that
  // gets a new function identity on every parent re-render (e.g. a form whose state lives in
  // the parent page re-renders the parent on every keystroke). If the refocus lived in the
  // same effect as `onEscape`, every keystroke would re-run it and steal focus back to the
  // first focusable element - typically the header's X close button, since it sits before
  // the form fields in the DOM - away from whatever the user was typing into.
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const items = getFocusable(container);
    (items[0] || container).focus();

    return () => {
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, containerRef]);

  // Escape/Tab handling can safely depend on onEscape - re-subscribing the listener has no
  // side effect on focus, unlike the effect above.
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onEscape?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusable(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      if (event.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeEl === last || !container.contains(activeEl))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [active, containerRef, onEscape]);
}
