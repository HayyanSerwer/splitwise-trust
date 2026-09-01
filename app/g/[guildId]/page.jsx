'use client';

import { use, useEffect, useState } from 'react';
import { formatAmount } from '@/lib/money';

export default function GuildPage({ params }) {
  const { guildId } = use(params);
  const [groups, setGroups] = useState(null);
  const [roster, setRoster] = useState(null);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const [g, m, o] = await Promise.all([
      fetch(`/api/groups?guildId=${guildId}`).then((r) => r.json()),
      fetch(`/api/guilds/${guildId}/members`).then((r) => r.json()),
      fetch(`/api/guilds/${guildId}/overview`).then((r) => r.json()),
    ]);
    if (g.error) return setError(g.error);
    if (m.error) return setError(m.error);
    if (o.error) return setError(o.error);
    setGroups(g.groups);
    setRoster(m);
    setOverview(o);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [guildId]);

  if (error) return <main className="wrap"><div className="error">{error}</div></main>;
  if (!groups || !roster || !overview) return <main className="wrap"><p className="note">Loading…</p></main>;

  return (
    <main className="wrap">
      <div className="row" style={{ marginBottom: 6 }}>
        <a className="note" href="/">← all servers</a>
      </div>
      <h1>{roster.guild.name}</h1>
      <p className="sub">Groups you are part of in this server.</p>

      <Overview overview={overview} />

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

// Everyone's position across every group at once. Read-only on purpose:
// settling happens inside a group, because a payment has to be recorded
// against a specific ledger to stay auditable.
function Overview({ overview }) {
  const { balances, transfers, groupCount, me } = overview;
  const active = balances.filter((b) => b.net !== 0);

  if (groupCount === 0) return null;

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Everyone, across all groups</h2>
        <div className="spacer" />
        <span className="note">{groupCount} group{groupCount === 1 ? '' : 's'}</span>
      </div>

      {active.length === 0 ? (
        <p className="note">Everyone is square.</p>
      ) : (
        <>
          {balances.map((b) => (
            <div key={b.id} className="line">
              {b.avatar && <img src={b.avatar} alt="" className="pill-avatar" />}
              <span>{b.name}{b.id === me ? ' (you)' : ''}</span>
              <span className={`amount ${b.net > 0 ? 'up' : b.net < 0 ? 'down' : ''}`}>
                {b.net === 0 ? 'settled' : formatAmount(b.net)}
              </span>
            </div>
          ))}

          <h2 style={{ marginTop: 20 }}>Simplest way to settle everything</h2>
          {transfers.map((t, i) => {
            const name = (id) => balances.find((b) => b.id === id)?.name ?? 'Someone';
            return (
              <div key={i} className="line">
                <span>
                  <strong>{name(t.fromUserId)}</strong> pays <strong>{name(t.toUserId)}</strong>
                </span>
                <span className="amount">{formatAmount(t.amountCents)}</span>
              </div>
            );
          })}
          <p className="note" style={{ marginTop: 10 }}>
            Netted across every group, so this can differ from any single group's
            settle-up. Record payments inside the group they belong to.
          </p>
        </>
      )}
    </div>
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
