'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    fetch('/api/guilds')
      .then(async (res) => {
        if (res.status === 401) return setState({ status: 'anon' });
        const data = await res.json();
        if (!res.ok) return setState({ status: 'error', error: data.error });
        setState({ status: 'ready', ...data });
      })
      .catch((err) => setState({ status: 'error', error: err.message }));
  }, []);

  return (
    <main className="wrap">
      <h1>Hisaab</h1>
      <p className="sub">Split expenses with your Discord friends, then post the tally straight to a channel.</p>

      {state.status === 'loading' && <p className="note">Loading…</p>}

      {state.status === 'anon' && (
        <div className="card">
          <h2>Sign in to continue</h2>
          <p className="note" style={{ marginBottom: 16 }}>
            We read your server list to find servers you share with the bot.
          </p>
          <a className="btn" href="/api/auth/login">Sign in with Discord</a>
        </div>
      )}

      {state.status === 'error' && <div className="error">{state.error}</div>}

      {state.status === 'ready' && (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <span className="note">Signed in as {state.user}</span>
            <div className="spacer" />
            <form action="/api/auth/logout" method="post">
              <button className="btn ghost" type="submit">Sign out</button>
            </form>
          </div>

          <div className="card">
            <h2>Pick a server</h2>
            {state.guilds.length === 0 && <p className="note">You are not in any servers.</p>}
            <div className="guilds">
              {state.guilds.map((g) => <Guild key={g.id} guild={g} />)}
            </div>
            <p className="note" style={{ marginTop: 14 }}>
              Greyed-out servers do not have the bot yet. Invite it there and reload.
            </p>
          </div>
        </>
      )}
    </main>
  );
}

function Guild({ guild }) {
  const inner = (
    <>
      {guild.icon
        ? <img src={guild.icon} alt="" />
        : <div className="fallback">{guild.name.slice(0, 2).toUpperCase()}</div>}
      <div className="meta">
        <div className="name">{guild.name}</div>
        {!guild.ready && <div className="hint">bot not added</div>}
      </div>
    </>
  );

  return guild.ready
    ? <a className="guild" href={`/g/${guild.id}`}>{inner}</a>
    : <div className="guild disabled">{inner}</div>;
}
