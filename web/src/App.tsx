import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarPage } from './components/CalendarPage';
import { ChatPage } from './components/ChatPage';

const PAGES = [
  { id: 'chat', label: '聊天室' },
  { id: 'calendar', label: '行事曆' },
] as const;

/**
 * Phones: the two pages sit side by side in a horizontal scroll-snap strip, so a
 * swipe switches pages natively; the tabs follow and can be tapped too.
 * Wide screens (CSS breakpoint): both pages are visible and the tabs are hidden.
 */
export function App() {
  const [active, setActive] = useState(0);
  // Bumped after any change so the calendar refetches (e.g. an entry logged in chat).
  const [version, setVersion] = useState(0);
  const pagerRef = useRef<HTMLDivElement>(null);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    const onScroll = () => {
      const index = Math.round(pager.scrollLeft / Math.max(pager.clientWidth, 1));
      setActive(Math.min(Math.max(index, 0), PAGES.length - 1));
    };
    pager.addEventListener('scroll', onScroll, { passive: true });
    return () => pager.removeEventListener('scroll', onScroll);
  }, []);

  const goTo = (index: number) => {
    const pager = pagerRef.current;
    pager?.scrollTo({ left: index * pager.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <img src="/icon.svg" alt="" width={24} height={24} />
          Coinslot
        </h1>
        <nav className="tabs" role="tablist">
          {PAGES.map((p, i) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={active === i}
              className={active === i ? 'active' : ''}
              onClick={() => goTo(i)}
            >
              {p.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="pager" ref={pagerRef}>
        <section className="pager-page" aria-label="聊天室">
          <ChatPage onChanged={bump} />
        </section>
        <section className="pager-page" aria-label="行事曆">
          <CalendarPage version={version} onChanged={bump} />
        </section>
      </main>
    </div>
  );
}
