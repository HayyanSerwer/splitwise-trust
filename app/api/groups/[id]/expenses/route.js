import { db, int } from '@/lib/db';
import { requireSession, requireGroup, route, httpError } from '@/lib/guard';
import { parseAmount, allocate, splitEqually, formatAmount } from '@/lib/money';

export const dynamic = 'force-dynamic';

// Turns whichever split the form submitted into a list of {userId, amountPaise}
// that sums to exactly `total`.
function buildShares(splitType, total, body, memberIds) {
  const belongs = (id) => memberIds.includes(id);

  if (splitType === 'equal') {
    const ids = (body.participants ?? memberIds).filter(belongs);
    if (!ids.length) throw httpError('Pick who this is split between', 400);
    return splitEqually(total, ids.length).map((amountPaise, i) => ({ userId: ids[i], amountPaise }));
  }

  const entries = Object.entries(body.shares ?? {}).filter(([id]) => belongs(id));
  if (!entries.length) throw httpError('Pick who this is split between', 400);

  if (splitType === 'exact') {
    const parts = entries.map(([userId, value]) => ({ userId, amountPaise: parseAmount(value) }));
    const sum = parts.reduce((a, p) => a + p.amountPaise, 0);
    if (sum !== total) {
      throw httpError(
        `Those amounts add up to ${formatAmount(sum)}, but the expense is ${formatAmount(total)}`,
        400,
      );
    }
    return parts;
  }

  if (splitType === 'shares') {
    const weights = entries.map(([, value]) => {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) throw httpError('Shares must be positive numbers', 400);
      return n;
    });
    return allocate(total, weights).map((amountPaise, i) => ({
      userId: entries[i][0],
      amountPaise,
    }));
  }

  throw httpError('Unknown split type', 400);
}

export const POST = route(async (request, { params }) => {
  const session = await requireSession();
  const { id } = await params;
  const { group, members } = await requireGroup(id, session);

  const body = await request.json();
  const description = String(body.description ?? '').trim();
  if (!description) throw httpError('Add a description', 400);

  const memberIds = members.map((m) => m.id);
  const payerId = body.payerId ?? session.userId;
  if (!memberIds.includes(payerId)) throw httpError('The payer is not in this group', 400);

  const total = parseAmount(body.amount);
  const splitType = body.splitType ?? 'equal';
  const shares = buildShares(splitType, total, body, memberIds);

  // One statement, so the expense can never land without its shares. The Neon
  // HTTP driver has no interactive transactions, and a half-written expense
  // would silently skew every balance in the group.
  const [row] = await db()`
    with e as (
      insert into expenses (group_id, payer_id, amount_paise, description, split_type, created_by)
      values (${group.id}, ${payerId}, ${total}, ${description.slice(0, 200)}, ${splitType}, ${session.userId})
      returning id
    ), s as (
      insert into expense_shares (expense_id, discord_user_id, amount_paise)
      select e.id, u.uid, u.amt
      from e, unnest(
        ${shares.map((s) => s.userId)}::text[],
        ${shares.map((s) => s.amountPaise)}::bigint[]
      ) as u(uid, amt)
      returning expense_id
    )
    select id from e
  `;

  return Response.json({ id: int(row.id) }, { status: 201 });
});
