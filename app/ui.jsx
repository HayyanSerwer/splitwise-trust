'use client';

import { useEffect, useRef, useState } from 'react';
import { formatAmount } from '@/lib/money';

// ---------- icons ----------

const paths = {
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5',
  logout: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11',
  users: 'M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zM22 19v-1a4 4 0 00-3-3.9M16 4.1a3 3 0 010 5.8',
};

export function Icon({ name, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export function DiscordLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.3 4.4A19.8 19.8 0 0015.4 3l-.6 1.3a18.4 18.4 0 00-5.6 0L8.6 3a19.7 19.7 0 00-4.9 1.4C.6 9-.3 13.5.1 18a19.9 19.9 0 006 3l1.3-2a12.9 12.9 0 01-2-1l.5-.4a14.2 14.2 0 0012.2 0l.5.4-2 1 1.3 2a19.8 19.8 0 006-3c.5-5.2-.8-9.7-3.6-13.6zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z" />
    </svg>
  );
}

// ---------- avatars ----------

export function Avatar({ src, name = '?', size, square, className = '' }) {
  const [broken, setBroken] = useState(false);
  const cls = ['avatar', size, square && 'square', className].filter(Boolean).join(' ');
  if (src && !broken) return <img src={src} alt="" className={cls} onError={() => setBroken(true)} />;
  const initials = name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return <div className={cls}>{initials || '?'}</div>;
}

export function AvatarStack({ people, max = 4 }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="stack">
      {shown.map((p) => <Avatar key={p.id} src={p.avatar} name={p.name} size="sm" />)}
      {extra > 0 && <div className="avatar sm">+{extra}</div>}
    </div>
  );
}

// ---------- layout ----------

export function TopBar({ title, back, children }) {
  return (
    <header className="topbar">
      {back && (
        <a className="icon-btn" href={back} aria-label="Back">
          <Icon name="back" />
        </a>
      )}
      <div className="title" style={back ? null : { paddingLeft: 8 }}>{title}</div>
      {children}
    </header>
  );
}

export function Sheet({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    // Stop the page behind from scrolling while the sheet is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grabber" />
        <div className="sheet-head">
          <div className="title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel, danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost block" onClick={onClose}>Cancel</button>
          <button
            className={`btn block${danger ? ' danger' : ''}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (err) {
                setError(err.message);
                setBusy(false);
              }
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      }
    >
      {error && <div className="error">{error}</div>}
      <p style={{ margin: '4px 0 8px', color: 'var(--muted)' }}>{message}</p>
    </Sheet>
  );
}

export function useToast() {
  const [message, setMessage] = useState(null);
  const timer = useRef();
  const show = (text) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), 2200);
  };
  const node = message ? <div className="toast" role="status">{message}</div> : null;
  return [node, show];
}

export function SkeletonPage({ hero = true, rows = 4 }) {
  return (
    <main className="wrap" aria-busy="true">
      <div className="topbar"><div className="skeleton" style={{ height: 22, width: 160, marginLeft: 8 }} /></div>
      {hero && <div className="skeleton" style={{ height: 150, borderRadius: 22, margin: '4px 0 28px' }} />}
      <div className="skeleton" style={{ height: 14, width: 90, margin: '0 4px 12px' }} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 60, marginBottom: 8 }} />
      ))}
    </main>
  );
}

// Re-runs `load` when the app comes back to the foreground, so a phone that
// was left on a page shows fresh balances instead of whatever was there hours ago.
export function useRefreshOnFocus(load) {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && ref.current();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}

// ---------- money wording ----------

export const money = (cents, currency) => formatAmount(Math.abs(cents), currency);

// "owes you €5" / "you owe €5" from the visitor's point of view.
export function relation(net, currency) {
  if (net > 0) return { text: `owes you ${money(net, currency)}`, cls: 'up' };
  if (net < 0) return { text: `you owe ${money(net, currency)}`, cls: 'down' };
  return { text: 'settled up', cls: '' };
}

// "gets back €5" / "owes €5" for a third person's overall position.
export function standing(net, currency) {
  if (net > 0) return { small: 'gets back', amount: money(net, currency), cls: 'up' };
  if (net < 0) return { small: 'owes', amount: money(net, currency), cls: 'down' };
  return { small: '', amount: 'settled', cls: '' };
}

// Labels clashing display names with the Discord username, so two people
// both called "Raahim" can be told apart.
export function disambiguator(people) {
  const counts = new Map();
  for (const p of people) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  return (p) => (counts.get(p.name) > 1 && p.username ? `@${p.username}` : null);
}

export async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
