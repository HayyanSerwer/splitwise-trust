import { db, int } from '@/lib/db';
import { requireSession, requireGroup, route, httpError } from '@/lib/guard';
import { parseAmount } from '@/lib/money';

export const dynamic = 'force-dynamic';

// Records that money actually changed hands. This is a ledger entry like any
// other, not a reset — the expenses it settles stay exactly as they were.
export const POST = route(async (request, { params }) => {
  const session = await requireSession();
  const { id } = await params;
  const { group, members } = await requireGroup(id, session);

  const { fromUserId, toUserId, amount } = await request.json();
  const memberIds = members.map((m) => m.id);

  if (!memberIds.includes(fromUserId) || !memberIds.includes(toUserId)) {
    throw httpError('Both people must be in this group', 400);
  }
  if (fromUserId === toUserId) throw httpError('Pick two different people', 400);

  const [row] = await db()`
    insert into settlements (group_id, from_user_id, to_user_id, amount_cents, created_by)
    values (${group.id}, ${fromUserId}, ${toUserId}, ${parseAmount(amount)}, ${session.userId})
    returning id
  `;

  return Response.json({ id: int(row.id) }, { status: 201 });
});
