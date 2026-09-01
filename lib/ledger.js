import { db, int } from '@/lib/db';
import { computeBalances, simplify } from '@/lib/balances';

// Loads the full ledger for a group in two queries, then derives everything
// else in memory. Groups are small enough that paging would cost more in
// complexity than it saves.
export async function loadLedger(groupId) {
  const sql = db();

  const [expenseRows, settlementRows] = await Promise.all([
    sql`
      select e.id, e.payer_id, e.amount_cents, e.description, e.split_type, e.created_at,
             coalesce(
               json_agg(json_build_object('userId', s.discord_user_id, 'amountCents', s.amount_cents))
               filter (where s.discord_user_id is not null),
               '[]'
             ) as shares
      from expenses e
      left join expense_shares s on s.expense_id = e.id
      where e.group_id = ${groupId} and e.deleted_at is null
      group by e.id
      order by e.created_at desc, e.id desc
    `,
    sql`
      select id, from_user_id, to_user_id, amount_cents, created_at
      from settlements
      where group_id = ${groupId} and deleted_at is null
      order by created_at desc, id desc
    `,
  ]);

  const expenses = expenseRows.map((e) => ({
    id: int(e.id),
    payerId: e.payer_id,
    amountCents: int(e.amount_cents),
    description: e.description,
    splitType: e.split_type,
    createdAt: e.created_at,
    shares: e.shares.map((s) => ({ userId: s.userId, amountCents: int(s.amountCents) })),
  }));

  const settlements = settlementRows.map((s) => ({
    id: int(s.id),
    fromUserId: s.from_user_id,
    toUserId: s.to_user_id,
    amountCents: int(s.amount_cents),
    createdAt: s.created_at,
  }));

  return { expenses, settlements };
}

export async function loadSummary(groupId, members) {
  const { expenses, settlements } = await loadLedger(groupId);
  const balances = computeBalances(members.map((m) => m.id), expenses, settlements);

  return {
    expenses,
    settlements,
    balances: members.map((m) => ({ ...m, net: balances.get(m.id) ?? 0 })),
    transfers: simplify(balances),
  };
}

// Everyone's net position across every group in a server, plus the transfers
// that would clear the whole thing at once. Netting across groups is the point:
// a debt in one group cancels a debt owed the other way in another, which the
// per-group views can never see.
//
// Computed in SQL rather than by loading each group's ledger, because this runs
// on a page that already fires several requests and the row counts are small.
export async function loadGuildOverview(guildId) {
  const sql = db();

  const [totals, people, groupCount] = await Promise.all([
    sql`
      with ledger as (
        select e.payer_id as uid, e.amount_cents as delta
        from expenses e join groups g on g.id = e.group_id
        where g.guild_id = ${guildId} and e.deleted_at is null

        union all
        select sh.discord_user_id, -sh.amount_cents
        from expense_shares sh
        join expenses e on e.id = sh.expense_id
        join groups g on g.id = e.group_id
        where g.guild_id = ${guildId} and e.deleted_at is null

        union all
        select st.from_user_id, st.amount_cents
        from settlements st join groups g on g.id = st.group_id
        where g.guild_id = ${guildId} and st.deleted_at is null

        union all
        select st.to_user_id, -st.amount_cents
        from settlements st join groups g on g.id = st.group_id
        where g.guild_id = ${guildId} and st.deleted_at is null
      )
      select uid, sum(delta) as net from ledger group by uid
    `,
    // The same person can be listed under different nicknames in different
    // groups; the most recently joined group wins.
    sql`
      select distinct on (m.discord_user_id)
             m.discord_user_id, m.display_name, m.avatar_url
      from group_members m join groups g on g.id = m.group_id
      where g.guild_id = ${guildId}
      order by m.discord_user_id, m.group_id desc
    `,
    sql`select count(*) as n from groups where guild_id = ${guildId}`,
  ]);

  const net = new Map(totals.map((r) => [r.uid, int(r.net)]));
  const balances = people
    .map((p) => ({
      id: p.discord_user_id,
      name: p.display_name,
      avatar: p.avatar_url,
      net: net.get(p.discord_user_id) ?? 0,
    }))
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));

  return {
    balances,
    transfers: simplify(new Map(balances.map((b) => [b.id, b.net]))),
    groupCount: int(groupCount[0].n),
  };
}
