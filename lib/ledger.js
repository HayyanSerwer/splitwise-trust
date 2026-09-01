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
