'use client';

import { use, useEffect, useState } from 'react';

export default function GuildPage({ params }) {
  const { guildId } = use(params);
  const [groups, setGroups] = useState(null);
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const [g, m] = await Promise.all([
      fetch(`/api/groups?guildId=${guildId}`).then((r) => r.json()),
      fetch(`/api/guilds/${guildId}/members`).then((r) => r.json()),
    ]);
    if (g.error) return setError(g.error);
    if (m.error) return setError(m.error);
    setGroups(g.groups);
    setRoster(m);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [guildId]);

  if (error) return <main className="wrap"><div className="error">{error}</div></main>;
  if (!groups || !roster) return <main className="wrap"><p className="note">Loading…</p></main>;

  return (
    <main className="wrap">
      <div className="row" style={{ marginBottom: 6 }}>
        <a className="note" href="/">← all servers</a>
      </div>
      <h1>{roster.guild.name}</h1>
      <p className="sub">Groups you are part of in this server.</p>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Groups</h2>
          <div className="spacer" />
          <button className="btn" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : 'New group'}
          </button>
        </div>

        {creating && (
          <NewGroup
            guildId={guildId}
            members={roster.members}
            onDone={() => { setCreating(false); load(); }}
          />
        )}

        {groups.length === 0 && !creating && (
          <p className="note">No groups yet. Create one to start splitting.</p>
        )}

        <div className="guilds">
          {groups.map((g) => (
            <a key={g.id} className="guild" href={`/g/${guildId}/${g.id}`}>
              <div className="fallback">{g.name.slice(0, 2).toUpperCase()}</div>
              <div className="meta">
                <div className="name">{g.name}</div>
                <div className="hint">{g.member_count} people</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}

function NewGroup({ guildId, members, onDone }) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId, name, memberIds: [...picked] }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error);
    onDone();
  }

  const shown = members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <form onSubmit={submit} style={{ marginBottom: 20 }}>
      {error && <div className="error">{error}</div>}
      <input
        type="search"
        placeholder="Group name — Goa trip, flat rent, …"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <input
        type="search"
        placeholder="Search members…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <div className="pool">
        {shown.map((m) => (
          <button
            type="button"
            key={m.id}
            className={`member${picked.has(m.id) ? ' selected' : ''}`}
            onClick={() => toggle(m.id)}
            style={{ background: 'none', border: '2px solid transparent', color: 'inherit', font: 'inherit' }}
          >
            <img src={m.avatar} alt="" />
            <span>{m.name}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <span className="note">{picked.size} selected — you are added automatically.</span>
        <div className="spacer" />
        <button className="btn" disabled={busy || !name.trim() || picked.size < 1}>
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </div>
    </form>
  );
}
