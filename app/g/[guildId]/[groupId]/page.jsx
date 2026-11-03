'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { parseAmount, splitEqually } from '@/lib/money';
import {
  Avatar, AvatarStack, Confirm, Icon, Sheet, SkeletonPage, TopBar,
  money, postJSON, standing, useRefreshOnFocus, useToast,
} from '../../../ui';

export default function GroupPage({ params }) {
  const { guildId, groupId } = use(params);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(null); // {type, ...}
  const [toast, flash] = useToast();

  async function load() {
    const res = await fetch(`/api/groups/${groupId}`);
    if (res.status === 401) return window.location.replace('/');
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setData(body);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    // Arriving from the server page's "Add expense" opens the form straight away.
    const url = new URL(window.location.href);
    if (url.searchParams.has('add')) {
      setSheet({ type: 'add' });
      url.searchParams.delete('add');
      history.replaceState(null, '', url);
    }
  }, [groupId]);

  useRefreshOnFocus(() => load().catch(() => {}));

  if (error) {
    return (
      <main className="wrap">
        <TopBar title="Hisaab" back={`/g/${guildId}`} />
        <div className="error">{error}</div>
      </main>
    );
  }
  if (!data) return <SkeletonPage />;

  const { group, members, balances, transfers, expenses, settlements, me } = data;
  const person = (id) => members.find((m) => m.id === id) ?? { id, name: 'Someone' };
  const nameOf = (id) => (id === me ? 'You' : person(id).name);
  const direct = group.kind === 'direct';
  const other = direct ? members.find((m) => m.id !== me) : null;
  const title = direct ? other?.name ?? 'Tab' : group.name;

  async function settle(t) {
    await postJSON(`/api/groups/${groupId}/settle`, {
      fromUserId: t.fromUserId,
      toUserId: t.toUserId,
      amount: (t.amountCents / 100).toFixed(2),
    });
    await load();
    flash('Payment recorded');
  }

  return (
    <main className="wrap">
      <TopBar title={title} back={`/g/${guildId}`}>
        <button className="icon-btn" onClick={() => setSheet({ type: 'share' })} aria-label="Post to Discord" title="Post to Discord">
          <Icon name="share" />
        </button>
      </TopBar>

      <Hero
        direct={direct}
        other={other}
        members={members}
        mine={balances.find((b) => b.id === me)?.net ?? 0}
        currency={group.currency}
        canSettle={transfers.length > 0}
        onSettle={() => (direct && transfers.length === 1
          ? setSheet({ type: 'confirm-settle', transfer: transfers[0] })
          : setSheet({ type: 'settle' }))}
      />

      {!direct && (
        <>
          <div className="section-head"><h2>Balances</h2></div>
          <div className="card">
            {[...balances].sort((a, b) => b.net - a.net).map((b) => {
              const s = standing(b.net, group.currency);
              return (
                <div key={b.id} className="row-item static">
                  <Avatar src={b.avatar} name={b.name} />
                  <div className="main"><div className="name">{b.name}{b.id === me ? ' (you)' : ''}</div></div>
                  <div className="end">
                    <span className="small">{s.small}</span>
                    <span className={`amt ${s.cls}`}>{s.amount}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="section-head"><h2>Activity</h2></div>
      <Activity
        expenses={expenses}
        settlements={settlements}
        me={me}
        nameOf={nameOf}
        currency={group.currency}
        onOpen={(e) => setSheet({ type: 'expense', expense: e })}
      />

      <button className="fab" onClick={() => setSheet({ type: 'add' })}>
        <Icon name="plus" /> Add expense
      </button>

      {sheet?.type === 'add' && (
        <AddExpense
          group={group}
          members={members}
          me={me}
          direct={direct}
          onClose={() => setSheet(null)}
          onDone={async () => { setSheet(null); await load(); flash('Expense added'); }}
        />
      )}

      {sheet?.type === 'settle' && (
        <Sheet title="Settle up" onClose={() => setSheet(null)}>
          <p className="note" style={{ marginTop: 0 }}>The fewest payments that square this group.</p>
          {transfers.map((t, i) => (
            <div key={i} className="row-item static">
              <Avatar src={person(t.fromUserId).avatar} name={person(t.fromUserId).name} size="sm" />
              <div className="main">
                <div className="name" style={{ fontWeight: 500 }}>
                  <strong>{nameOf(t.fromUserId)}</strong> {t.fromUserId === me ? 'pay' : 'pays'} <strong>{nameOf(t.toUserId)}</strong>
                </div>
                <div className="meta num">{money(t.amountCents, group.currency)}</div>
              </div>
              <button className="btn small" onClick={() => setSheet({ type: 'confirm-settle', transfer: t })}>Mark paid</button>
            </div>
          ))}
        </Sheet>
      )}

      {sheet?.type === 'confirm-settle' && (
        <Confirm
          title="Record payment?"
          message={`${nameOf(sheet.transfer.fromUserId)} paid ${nameOf(sheet.transfer.toUserId) === 'You' ? 'you' : nameOf(sheet.transfer.toUserId)} ${money(sheet.transfer.amountCents, group.currency)}.`}
          confirmLabel="Mark as paid"
          onConfirm={() => settle(sheet.transfer)}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'expense' && (
        <ExpenseDetail
          expense={sheet.expense}
          person={person}
          nameOf={nameOf}
          currency={group.currency}
          onClose={() => setSheet(null)}
          onDelete={() => setSheet({ type: 'confirm-delete', expense: sheet.expense })}
        />
      )}

      {sheet?.type === 'confirm-delete' && (
        <Confirm
          title="Delete expense?"
          message={`"${sheet.expense.description}" will be removed and everyone's balances updated.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            const res = await fetch(`/api/groups/${groupId}/expenses/${sheet.expense.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).error ?? 'Could not delete');
            await load();
            flash('Expense deleted');
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'share' && (
        <PostToDiscord guildId={guildId} groupId={groupId} onClose={() => setSheet(null)} onDone={(m) => { setSheet(null); flash(m); }} />
      )}

      {toast}
    </main>
  );
}

function Hero({ direct, other, members, mine, currency, canSettle, onSettle }) {
  const tone = mine > 0 ? 'owed' : mine < 0 ? 'owe' : '';
  let label;
  if (direct) {
    label = mine > 0 ? `${other?.name} owes you` : mine < 0 ? `You owe ${other?.name}` : `You and ${other?.name} are`;
  } else {
    label = mine > 0 ? 'You are owed' : mine < 0 ? 'You owe' : 'You are';
  }

  return (
    <div className={`hero ${tone}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, position: 'relative', zIndex: 1 }}>
        <div className="label">{label}</div>
        {direct
          ? <Avatar src={other?.avatar} name={other?.name} />
          : <AvatarStack people={members} />}
      </div>
      <div className="big num">{mine === 0 ? 'all square' : money(mine, currency)}</div>
      {!direct && <div className="detail">{members.length} people in this group</div>}
      {canSettle && (
        <div className="actions">
          <button className="btn solid" onClick={onSettle}>Settle up</button>
        </div>
      )}
    </div>
  );
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function dayLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return dayFormat.format(d);
}

function Activity({ expenses, settlements, me, nameOf, currency, onOpen }) {
  const items = useMemo(
    () => [
      ...expenses.map((e) => ({ kind: 'expense', at: e.createdAt, e })),
      ...settlements.map((s) => ({ kind: 'settle', at: s.createdAt, s })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)),
    [expenses, settlements],
  );

  if (items.length === 0) {
    return <div className="card"><div className="empty">No expenses yet. Tap Add expense to record the first one.</div></div>;
  }

  const days = [];
  for (const item of items) {
    const label = dayLabel(item.at);
    if (days.at(-1)?.label !== label) days.push({ label, items: [] });
    days.at(-1).items.push(item);
  }

  return (
    <div className="card" style={{ paddingTop: 0 }}>
      {days.map((day) => (
        <div key={day.label}>
          <div className="day">{day.label}</div>
          {day.items.map((item) => {
            if (item.kind === 'settle') {
              const { s } = item;
              return (
                <div key={`s${s.id}`} className="row-item static">
                  <div className="avatar tile" style={{ color: 'var(--up)' }}><Icon name="check" /></div>
                  <div className="main">
                    <div className="name" style={{ fontWeight: 500 }}>
                      {nameOf(s.fromUserId)} paid {nameOf(s.toUserId) === 'You' ? 'you' : nameOf(s.toUserId)}
                    </div>
                    <div className="meta">Payment</div>
                  </div>
                  <div className="end"><span className="amt" style={{ color: 'var(--muted)' }}>{money(s.amountCents, currency)}</span></div>
                </div>
              );
            }
            const { e } = item;
            const myShare = e.shares.find((s) => s.userId === me)?.amountCents ?? 0;
            const effect = e.payerId === me ? e.amountCents - myShare : -myShare;
            return (
              <button key={`e${e.id}`} className="row-item" onClick={() => onOpen(e)}>
                <div className="avatar tile">{e.description.slice(0, 1).toUpperCase()}</div>
                <div className="main">
                  <div className="name">{e.description}</div>
                  <div className="meta">{nameOf(e.payerId)} paid {money(e.amountCents, currency)}</div>
                </div>
                <div className="end">
                  {effect === 0 ? (
                    <span className="small">not involved</span>
                  ) : (
                    <>
                      <span className="small">{effect > 0 ? 'you lent' : 'you borrowed'}</span>
                      <span className={`amt ${effect > 0 ? 'up' : 'down'}`}>{money(effect, currency)}</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ExpenseDetail({ expense, person, nameOf, currency, onClose, onDelete }) {
  return (
    <Sheet
      title={expense.description}
      onClose={onClose}
      footer={<button className="btn danger block" onClick={onDelete}>Delete expense</button>}
    >
      <div style={{ textAlign: 'center', padding: '4px 0 16px' }}>
        <div style={{ fontSize: 40, fontWeight: 800 }} className="num">{money(expense.amountCents, currency)}</div>
        <div className="note">
          Paid by {nameOf(expense.payerId)} · {new Date(expense.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>
      <div className="day" style={{ paddingLeft: 4 }}>Split</div>
      {expense.shares.map((s) => (
        <div key={s.userId} className="row-item static">
          <Avatar src={person(s.userId).avatar} name={person(s.userId).name} size="sm" />
          <div className="main"><div className="name" style={{ fontWeight: 500 }}>{nameOf(s.userId)}</div></div>
          <div className="end"><span className="amt">{money(s.amountCents, currency)}</span></div>
        </div>
      ))}
    </Sheet>
  );
}

function AddExpense({ group, members, me, direct, onClose, onDone }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState(me);
  // A one-to-one tab is usually "I covered you", so default to that there.
  const [splitType, setSplitType] = useState(direct ? 'full' : 'equal');
  const [participants, setParticipants] = useState(new Set(members.map((m) => m.id)));
  const [shares, setShares] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const name = (id) => (id === me ? 'You' : members.find((m) => m.id === id)?.name ?? 'Someone');
  const total = (() => { try { return parseAmount(amount); } catch { return 0; } })();
  const debtor = members.find((m) => m.id !== payerId)?.id;

  const toggle = (id) =>
    setParticipants((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const included = members.filter((m) => participants.has(m.id));
  const equalParts = total && included.length ? splitEqually(total, included.length) : [];
  const exactSum = Object.entries(shares)
    .filter(([id, v]) => participants.has(id) && v !== '')
    .reduce((sum, [, v]) => { try { return sum + parseAmount(v); } catch { return sum; } }, 0);

  let summary = null;
  if (total) {
    if (splitType === 'full') {
      summary = payerId === me
        ? <><strong>{name(debtor)}</strong> will owe you <strong>{money(total, group.currency)}</strong></>
        : <>You will owe <strong>{name(payerId)}</strong> <strong>{money(total, group.currency)}</strong></>;
    } else if (splitType === 'exact') {
      const left = total - exactSum;
      summary = left === 0
        ? <>All <strong>{money(total, group.currency)}</strong> assigned</>
        : <><strong>{money(left, group.currency)}</strong> {left > 0 ? 'left to assign' : 'too much assigned'}</>;
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // "Owed in full" is an exact split with the whole amount on whoever
      // didn't pay, so the server needs no special case for it.
      const owedInFull = splitType === 'full';
      await postJSON(`/api/groups/${group.id}/expenses`, {
        description,
        amount,
        payerId,
        splitType: owedInFull ? 'exact' : splitType,
        participants: [...participants],
        shares: owedInFull
          ? { [debtor]: amount }
          : Object.fromEntries(Object.entries(shares).filter(([id, v]) => participants.has(id) && v !== '')),
      });
      await onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const modes = [
    ...(direct ? [['full', 'Owed in full']] : []),
    ['equal', 'Split equally'],
    ['exact', 'Exact amounts'],
    ['shares', 'By shares'],
  ];

  return (
    <Sheet
      title="Add expense"
      onClose={onClose}
      footer={
        <button className="btn block" disabled={busy || !total || !description.trim()} onClick={submit}>
          {busy ? 'Adding…' : total ? `Add ${money(total, group.currency)}` : 'Add expense'}
        </button>
      }
    >
      {error && <div className="error">{error}</div>}

      <div className="amount-input">
        <span className="cur">€</span>
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: `${Math.max(4, amount.length + 1)}ch` }}
          autoFocus
          aria-label="Amount"
        />
      </div>

      <label className="field">
        <span>What for?</span>
        <input type="text" placeholder="Dinner, taxi, groceries…" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <div className="field">
        <span>Paid by</span>
        <div className="chips">
          {members.map((m) => (
            <button key={m.id} type="button" className={`chip${payerId === m.id ? ' on' : ''}`} onClick={() => setPayerId(m.id)}>
              <Avatar src={m.avatar} name={m.name} />
              {m.id === me ? 'You' : m.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 8 }}>
        <span>Split</span>
        <div className="segmented">
          {modes.map(([value, label]) => (
            <button key={value} type="button" className={splitType === value ? 'on' : ''} onClick={() => setSplitType(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {summary && <div className="summary-line">{summary}</div>}

      {splitType !== 'full' && members.map((m) => {
        const on = participants.has(m.id);
        const index = included.findIndex((p) => p.id === m.id);
        return (
          <div key={m.id} className="split-row">
            <button type="button" className={`check${on ? ' on' : ''}`} onClick={() => toggle(m.id)} aria-label={`Include ${m.name}`}>
              {on && <Icon name="check" />}
            </button>
            <Avatar src={m.avatar} name={m.name} size="sm" />
            <div className="main">{m.id === me ? 'You' : m.name}</div>
            {splitType === 'equal' && on && equalParts.length > 0 && (
              <span className="num note">{money(equalParts[index], group.currency)}</span>
            )}
            {splitType !== 'equal' && on && (
              <input
                type="text"
                inputMode="decimal"
                placeholder={splitType === 'exact' ? '0.00' : '1'}
                value={shares[m.id] ?? ''}
                onChange={(e) => setShares((s) => ({ ...s, [m.id]: e.target.value }))}
              />
            )}
          </div>
        );
      })}
    </Sheet>
  );
}

function PostToDiscord({ guildId, groupId, onClose, onDone }) {
  const [channels, setChannels] = useState(null);
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
    <Sheet
      title="Post to Discord"
      onClose={onClose}
      footer={
        <button
          className="btn block"
          disabled={busy || !channelId}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await postJSON(`/api/groups/${groupId}/post`, { channelId });
              onDone('Posted to Discord');
            } catch (err) {
              setError(err.message);
              setBusy(false);
            }
          }}
        >
          {busy ? 'Posting…' : 'Post balances'}
        </button>
      }
    >
      <p className="note" style={{ marginTop: 0 }}>Shares who owes who in a channel. Nobody gets pinged.</p>
      {error && <div className="error">{error}</div>}
      {!channels && !error && <div className="skeleton" style={{ height: 46 }} />}
      {channels && (
        <label className="field">
          <span>Channel</span>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </select>
        </label>
      )}
    </Sheet>
  );
}
