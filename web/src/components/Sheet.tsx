import { useEffect, type ReactNode } from 'react';

/** Bottom sheet on phones, side drawer on wide screens. Escape or backdrop closes it. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}
