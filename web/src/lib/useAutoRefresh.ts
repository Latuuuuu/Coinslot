import { useEffect } from 'react';

/** Re-run `refresh` when the tab becomes visible again and every `intervalMs` while visible. */
export function useAutoRefresh(refresh: () => void, intervalMs = 30_000): void {
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = window.setInterval(onVisible, intervalMs);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(timer);
    };
  }, [refresh, intervalMs]);
}
