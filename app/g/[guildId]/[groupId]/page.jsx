'use client';

import { use, useEffect, useState } from 'react';
import { formatAmount } from '@/lib/money';

export default function GroupPage({ params }) {
  const { guildId, groupId } = use(params);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  async function load() {
    const res = await fetch(`/api/groups/${groupId}`);
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setData(body);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [groupId]);

  function flash(message) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  if (error) return <main className="wrap"><div className="error">{error}</div></main>;
  if (!data) return <main className="wrap"><p className="note">Loading…</p></main>;

  const { group, members, balances, transfers, expenses, settlements, me } = data;
  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? 'Someone';

  return (
    <main className="wrap">
      <div className="row" style={{ marginBottom: 6 }}>
        <a className="note" href={`/g/${guildId}`}>← groups</a>
      </div>
      <h1>{group.name}</h1>
      <p className="sub">{members.length} people · {expenses.length} expenses</p>

      <div className="card">
        <h2>Settle up</h2>
        {transfers.length === 0 ? (
          <p className="note">Everyone is square.</p>
        ) : (
          transfers.map((t, i) => (
            <div key={i} className="line">
              <span>
                <strong>{nameOf(t.fromUserId)}</strong> pays <strong>{nameOf(t.toUserId)}</strong>
              </span>
              <span className="amount">{formatAmount(t.amountCents, group.currency)}</span>
              <button
                className="btn ghost"
                onClick={async () => {
                  await post(`/api/groups/${groupId}/settle`, {
                    fromUserId: t.fromUserId,
                    toUserId: t.toUserId,
                    amount: (t.amountCents / 100).toFixed(2),
                  });
                  await load();
                  flash('Marked as paid');
                }}
              >
                Mark paid
              </button>
            </div>
          ))
        )}

        <h2 style={{ marginTop: 20 }}>Standings</h2>
        {balances.map((b) => (
          <div key={b.id} className="line">
            <span>{b.name}{b.id === me ? ' (you)' : ''}</span>
            <span className={`amount ${b.net > 0 ? 'up' : b.net < 0 ? 'down' : ''}`}>
              {b.net === 0 ? 'settled' : formatAmount(b.net, group.currency)}
            </span>
          </div>
        ))}

        <PostToDiscord guildId={guildId} groupId={groupId} onDone={flash} />
      </div>

      <AddExpense group={group} members={members} me={me} onDone={() => { load(); flash('Expense added'); }} />

      <div className="card">
        <h2>History</h2>
        {expenses.length === 0 && settlements.length === 0 && <p className="note">Nothing yet.</p>}

        {expenses.map((e) => (
          <div key={`e${e.id}`} className="line">
            <span>
              <strong>{e.description}</strong>
              <span className="note"> · {nameOf(e.payerId)} paid · split {e.shares.length} ways</span>
            </span>
            <span className="amount">{formatAmount(e.amountCents, group.currency)}</span>
            <button
              className="btn ghost"
              onClick={async () => {
                if (!confirm(`Delete "${e.description}"?`)) return;
                await fetch(`/api/groups/${groupId}/expenses/${e.id}`, { method: 'DELETE' });
                await load();
                flash('Deleted');
              }}
            >
              Delete
            </button>
          </div>
        ))}

        {settlements.map((s) => (
          <div key={`s${s.id}`} className="line">
            <span className="note">
              {nameOf(s.fromUserId)} paid {nameOf(s.toUserId)}
            </span>
            <span className="amount">{formatAmount(s.amountCents, group.currency)}</span>
          </div>
        ))}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

function AddExpense({ group, members, me, onDone }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState(me);
  const [splitType, setSplitType] = useState('equal');
  const [participants, setParticipants] = useState(new Set(members.map((m) => m.id)));
  const [shares, setShares] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (id) =>
    setParticipants((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(`/api/groups/${group.id}/expenses`, {
        description,
        amount,
        payerId,
        splitType,
        participants: [...participants],
        shares: Object.fromEntries(
          Object.entries(shares).filter(([id, v]) => participants.has(id) && v !== ''),
        ),
      });
      setDescription('');
      setAmount('');
      setShares({});
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add an expense</h2>
      {error && <div className="error">{error}</div>}

      <div className="row" style={{ marginBottom: 10 }}>
        <input
          type="search"
          placeholder="What was it for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ flex: 2, minWidth: 180 }}
        />
        <input
          type="search"
          inputMode="decimal"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ flex: 1, minWidth: 120 }}
        />
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <label className="note">Paid by</label>
        <select value={payerId} onChange={(e) => setPayerId(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <label className="note">Split</label>
        <select value={splitType} onChange={(e) => setSplitType(e.target.value)}>
          <option value="equal">equally</option>
          <option value="exact">by exact amounts</option>
          <option value="shares">by shares</option>
        </select>
      </div>

      {members.map((m) => (
        <div key={m.id} className="line">
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={participants.has(m.id)} onChange={() => toggle(m.id)} />
            <span>{m.name}</span>
          </label>
          <div className="spacer" />
          {splitType !== 'equal' && participants.has(m.id) && (
            <input
              type="search"
              inputMode="decimal"
              placeholder={splitType === 'exact' ? 'amount' : 'shares'}
              value={shares[m.id] ?? ''}
              onChange={(e) => setShares((s) => ({ ...s, [m.id]: e.target.value }))}
              style={{ width: 110 }}
            />
          )}
        </div>
      ))}

      <button className="btn" style={{ marginTop: 12 }} disabled={busy}>
        {busy ? 'Adding…' : 'Add expense'}
      </button>
    </form>
  );
}

function PostToDiscord({ guildId, groupId, onDone }) {
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/guilds/${guildId}/channels`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setChannels(d.channels);
        setChannelId(d.channels[0]?.id ?? '');
      })
      .catch((err) => setError(err.message));
  }, [guildId]);

  return (
    <div className="row" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
      {error && <div className="error">{error}</div>}
      <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>#{c.name}</option>
        ))}
      </select>
      <button
        className="btn"
        disabled={busy || !channelId}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await post(`/api/groups/${groupId}/post`, { channelId });
            onDone('Posted to Discord');
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Posting…' : 'Post to Discord'}
      </button>
    </div>
  );
}
