'use client';

import { useEffect, useState } from 'react';
import { forgetServer, serverToRestore } from '@/lib/last-server';
import { Avatar, DiscordLogo, Icon, SkeletonPage } from './ui';

export default function Home() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    const last = serverToRestore();
    if (last) {
      window.location.replace(`/g/${last}`);
      return;
    }
    fetch('/api/guilds')
      .then(async (res) => {
        if (res.status === 401) return setState({ status: 'anon' });
        const data = await res.json();
        if (!res.ok) return setState({ status: 'error', error: data.error });
        setState({ status: 'ready', ...data });
      })
      .catch((err) => setState({ status: 'error', error: err.message }));
  }, []);

  if (state.status === 'loading') return <SkeletonPage hero={false} rows={5} />;

  if (state.status === 'anon') {
    return (
      <main className="wrap">
        <div className="welcome" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 64px)' }}>
          <img src="/icons/icon-192.png" alt="" />
          <h1>Hisaab</h1>
          <p>Split bills with your Discord friends and always know who owes who.</p>
          <a className="btn discord" href="/api/auth/login">
            <DiscordLogo /> Continue with Discord
          </a>
          <p className="note" style={{ marginTop: 20 }}>
            We only read your server list, to find the ones the bot is in.
          </p>
        </div>
      </main>
    );
  }

  const ready = state.guilds?.filter((g) => g.ready) ?? [];
  const missing = state.guilds?.filter((g) => !g.ready) ?? [];

  return (
    <main className="wrap">
      <div className="brand">
        <img src="/icons/icon-192.png" alt="" />
        <div style={{ flex: 1 }}>
          <div className="word">Hisaab</div>
          {state.user && <div className="note">Signed in as {state.user}</div>}
        </div>
        {state.status === 'ready' && (
          <form action="/api/auth/logout" method="post" onSubmit={forgetServer}>
            <button className="icon-btn" type="submit" aria-label="Sign out" title="Sign out">
              <Icon name="logout" />
            </button>
          </form>
        )}
      </div>

      {state.status === 'error' && <div className="error">{state.error}</div>}

      {state.status === 'ready' && (
        <>
          <div className="section-head"><h2>Your servers</h2></div>
          <div className="card">
            {ready.length === 0 && (
              <div className="empty">The bot isn&apos;t in any of your servers yet. Invite it, then reload.</div>
            )}
            {ready.map((g) => (
              <a key={g.id} className="row-item" href={`/g/${g.id}`}>
                <Avatar src={g.icon} name={g.name} square />
                <div className="main"><div className="name">{g.name}</div></div>
                <Icon name="chevron" className="chev" />
              </a>
            ))}
          </div>

          {missing.length > 0 && (
            <details className="card fold">
              <summary>
                <span>Bot not added <span className="note">· {missing.length}</span></span>
                <Icon name="chevron" />
              </summary>
              {missing.map((g) => (
                <div key={g.id} className="row-item disabled">
                  <Avatar src={g.icon} name={g.name} square />
                  <div className="main"><div className="name">{g.name}</div></div>
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </main>
  );
}
