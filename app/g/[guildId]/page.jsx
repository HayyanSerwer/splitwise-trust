'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { forgetServer, rememberServer } from '@/lib/last-server';
import {
  Avatar, Icon, Sheet, SkeletonPage, TopBar,
  disambiguator, money, postJSON, relation, standing, useRefreshOnFocus,
} from '../../ui';

export default function GuildPage({ params }) {
  const { guildId } = use(params);
  const [groups, setGroups] = useState(null);
  const [roster, setRoster] = useState(null);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(null); // 'add' | 'person' | 'group'

  async function load() {
    const [g, m, o] = await Promise.all([
      fetch(`/api/groups?guildId=${guildId}`).then((r) => {
        // Signed out since last time: go to the home page to sign in.
        if (r.status === 401) {
          window.location.replace('/');
          return new Promise(() => {});
        }
        return r.json();
      }),
      roster ? Promise.resolve(roster) : fetch(`/api/guilds/${guildId}/members`).then((r) => r.json()),
      fetch(`/api/guilds/${guildId}/overview`).then((r) => r.json()),
    ]);
    const failed = g.error || m.error || o.error;
    if (failed) {
      // Don't keep reopening a server that no longer loads.
      forgetServer();
      return setError(failed);
    }
    rememberServer(guildId);
    setGroups(g.groups);
    setRoster(m);
    setOverview(o);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [guildId]);

  useRefreshOnFocus(() => load().catch(() => {}));

  const byId = useMemo(() => new Map((roster?.members ?? []).map((m) => [m.id, m])), [roster]);
  const tag = useMemo(() => disambiguator(roster?.members ?? []), [roster]);

  if (error) {
    return (
      <main className="wrap">
        <TopBar title="Hisaab" back="/" />
        <div className="error">{error}</div>
      </main>
    );
  }
  if (!groups || !roster || !overview) return <SkeletonPage />;

  const me = overview.me;
  const tabs = groups.filter((g) => g.kind === 'direct');
  const realGroups = groups.filter((g) => g.kind !== 'direct');
  const others = roster.members.filter((m) => m.id !== me);

  // Clicking a person either opens the existing tab or creates it first.
  async function openPerson(userId, add) {
    const { id } = await postJSON('/api/direct', { guildId, userId });
    window.location.href = `/g/${guildId}/${id}${add ? '?add=1' : ''}`;
  }

  return (
    <main className="wrap">
      <TopBar title={roster.guild.name} back="/" />

      <Summary overview={overview} tag={(id) => tag(byId.get(id) ?? {})} />

      <div className="section-head">
        <h2>People</h2>
        <button className="link" onClick={() => setSheet('person')}>+ New</button>
      </div>
      <div className="card">
        {tabs.length === 0 && (
          <div className="empty">Add an expense with one person, no group needed.</div>
        )}
        {tabs.map((t) => {
          const person = byId.get(t.other?.id) ?? t.other ?? { name: t.name };
          const r = relation(t.my_net);
          return (
            <a key={t.id} className="row-item" href={`/g/${guildId}/${t.id}`}>
              <Avatar src={person.avatar} name={person.name} />
              <div className="main">
                <div className="name">{person.name}</div>
                <div className={`meta ${r.cls}`}>{tag(person) ? `${tag(person)} · ` : ''}{r.text}</div>
              </div>
              <Icon name="chevron" className="chev" />
            </a>
          );
        })}
      </div>

      <div className="section-head">
        <h2>Groups</h2>
        <button className="link" onClick={() => setSheet('group')}>+ New</button>
      </div>
      <div className="card">
        {realGroups.length === 0 && <div className="empty">No groups yet. Make one for a trip or the flat.</div>}
        {realGroups.map((g) => {
          const r = relation(g.my_net);
          return (
            <a key={g.id} className="row-item" href={`/g/${guildId}/${g.id}`}>
              <div className="avatar tile">{g.name.slice(0, 1).toUpperCase()}</div>
              <div className="main">
                <div className="name">{g.name}</div>
                <div className="meta">{g.member_count} people</div>
              </div>
              <div className="end">
                <span className={`amt ${r.cls}`} style={{ fontSize: 13 }}>
                  {g.my_net === 0 ? 'settled' : g.my_net > 0 ? `+${money(g.my_net)}` : `−${money(g.my_net)}`}
                </span>
              </div>
              <Icon name="chevron" className="chev" />
            </a>
          );
        })}
      </div>

      <Everyone overview={overview} tag={(id) => tag(byId.get(id) ?? {})} />

      <button className="fab" onClick={() => setSheet('add')}>
        <Icon name="plus" /> Add expense
      </button>

      {sheet === 'add' && (
        <PickTarget
          groups={realGroups}
          people={others}
          tag={tag}
          onGroup={(id) => { window.location.href = `/g/${guildId}/${id}?add=1`; }}
          onPerson={(id) => openPerson(id, true)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'person' && (
        <PickTarget
          title="Who with?"
          people={others}
          tag={tag}
          onPerson={(id) => openPerson(id, false)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'group' && (
        <NewGroup guildId={guildId} members={others} tag={tag} onClose={() => setSheet(null)} />
      )}
    </main>
  );
}

// The visitor's own position across the whole server, with the netted
// payments that involve them.
function Summary({ overview, tag }) {
  const { balances, transfers, groupCount, me } = overview;
  const mine = balances.find((b) => b.id === me)?.net ?? 0;
  const name = (id) => {
    const base = balances.find((b) => b.id === id)?.name ?? 'Someone';
    return tag(id) ? `${base} (${tag(id)})` : base;
  };
  const involving = transfers.filter((t) => t.fromUserId === me || t.toUserId === me);

  const tone = mine > 0 ? 'owed' : mine < 0 ? 'owe' : '';
  const label = mine > 0 ? 'You are owed' : mine < 0 ? 'You owe' : 'You are';

  return (
    <div className={`hero ${tone}`}>
      <div className="label">{label}</div>
      <div className="big num">{mine === 0 ? 'all square' : money(mine)}</div>
      <div className="detail">
        {groupCount === 0
          ? 'Nothing recorded yet. Tap Add expense to start.'
          : involving.length
            ? involving.slice(0, 3).map((t) => (t.toUserId === me
                ? `${name(t.fromUserId)} owes you ${money(t.amountCents)}`
                : `you owe ${name(t.toUserId)} ${money(t.amountCents)}`)).join(' · ')
            : `Across ${groupCount} group${groupCount === 1 ? '' : 's'} and tabs`}
      </div>
    </div>
  );
}

// Everyone's position across every ledger in the server. Read-only: payments
// are recorded inside the group or tab they belong to.
function Everyone({ overview, tag }) {
  const { balances, transfers, me } = overview;
  const active = balances.filter((b) => b.net !== 0);
  if (active.length === 0) return null;
  const name = (id) => {
    const base = balances.find((b) => b.id === id)?.name ?? 'Someone';
    return tag(id) ? `${base} (${tag(id)})` : base;
  };

  return (
    <>
      <div className="section-head"><h2>Whole server</h2></div>
      <details className="card fold">
        <summary>
          <span>Everyone&apos;s balance <span className="note">· {active.length} not settled</span></span>
          <Icon name="chevron" />
        </summary>
        {active.map((b) => {
          const s = standing(b.net);
          return (
            <div key={b.id} className="row-item static">
              <Avatar src={b.avatar} name={b.name} />
              <div className="main">
                <div className="name">{b.name}{b.id === me ? ' (you)' : ''}</div>
                {tag(b.id) && <div className="meta">{tag(b.id)}</div>}
              </div>
              <div className="end">
                <span className="small">{s.small}</span>
                <span className={`amt ${s.cls}`}>{s.amount}</span>
              </div>
            </div>
          );
        })}
        <div className="day">Fewest payments to clear it all</div>
        {transfers.map((t, i) => (
          <div key={i} className="row-item static">
            <div className="main">
              <div className="name" style={{ fontWeight: 500 }}>
                <strong>{name(t.fromUserId)}</strong> → <strong>{name(t.toUserId)}</strong>
              </div>
            </div>
            <div className="end"><span className="amt">{money(t.amountCents)}</span></div>
          </div>
        ))}
        <p className="note" style={{ padding: '4px 16px 14px', margin: 0 }}>
          Netted across every group and tab. Record payments inside the one they belong to.
        </p>
      </details>
    </>
  );
}

function PickTarget({ title = 'Add an expense', groups = [], people, tag, onGroup, onPerson, onClose }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const q = query.toLowerCase();
  const matches = (s) => s.toLowerCase().includes(q);

  const shownGroups = groups.filter((g) => matches(g.name));
  const shownPeople = people.filter((p) => matches(p.name) || matches(p.username ?? ''));

  async function pick(key, action) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <input
        type="search"
        placeholder="Search people or groups"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      {error && <div className="error">{error}</div>}

      {shownGroups.length > 0 && <div className="day" style={{ paddingLeft: 4 }}>Groups</div>}
      {shownGroups.map((g) => (
        <button key={g.id} className="row-item" disabled={busy !== null} onClick={() => pick(`g${g.id}`, () => onGroup(g.id))}>
          <div className="avatar tile">{g.name.slice(0, 1).toUpperCase()}</div>
          <div className="main">
            <div className="name">{g.name}</div>
            <div className="meta">{g.member_count} people</div>
          </div>
          {busy === `g${g.id}` ? <span className="note">Opening…</span> : <Icon name="chevron" className="chev" />}
        </button>
      ))}

      <div className="day" style={{ paddingLeft: 4 }}>People</div>
      {shownPeople.length === 0 && <div className="empty">No one matches.</div>}
      {shownPeople.map((p) => (
        <button key={p.id} className="row-item" disabled={busy !== null} onClick={() => pick(p.id, () => onPerson(p.id))}>
          <Avatar src={p.avatar} name={p.name} />
          <div className="main">
            <div className="name">{p.name}</div>
            {tag(p) && <div className="meta">{tag(p)}</div>}
          </div>
          {busy === p.id ? <span className="note">Opening…</span> : <Icon name="chevron" className="chev" />}
        </button>
      ))}
    </Sheet>
  );
}

function NewGroup({ guildId, members, tag, onClose }) {
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

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await postJSON('/api/groups', { guildId, name, memberIds: [...picked] });
      window.location.href = `/g/${guildId}/${id}`;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const q = query.toLowerCase();
  const shown = members.filter((m) => m.name.toLowerCase().includes(q) || m.username?.toLowerCase().includes(q));

  return (
    <Sheet
      title="New group"
      onClose={onClose}
      footer={
        <button className="btn block" disabled={busy || !name.trim() || picked.size < 1} onClick={submit}>
          {busy ? 'Creating…' : picked.size ? `Create with ${picked.size + 1} people` : 'Pick at least one person'}
        </button>
      }
    >
      {error && <div className="error">{error}</div>}
      <label className="field">
        <span>Name</span>
        <input type="text" placeholder="Lisbon trip, flat bills…" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="field" style={{ marginBottom: 8 }}>
        <span>Who&apos;s in it? You&apos;re added automatically.</span>
        <input type="search" placeholder="Search members" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {shown.map((m) => (
        <button key={m.id} type="button" className="row-item" onClick={() => toggle(m.id)}>
          <Avatar src={m.avatar} name={m.name} />
          <div className="main">
            <div className="name">{m.name}</div>
            {tag(m) && <div className="meta">{tag(m)}</div>}
          </div>
          <span className={`check${picked.has(m.id) ? ' on' : ''}`}>{picked.has(m.id) && <Icon name="check" />}</span>
        </button>
      ))}
    </Sheet>
  );
}
