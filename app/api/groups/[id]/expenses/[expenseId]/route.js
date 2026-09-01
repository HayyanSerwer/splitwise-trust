import { db } from '@/lib/db';
import { requireSession, requireGroup, route, httpError } from '@/lib/guard';

export const dynamic = 'force-dynamic';

// Soft delete. The row stays so a balance that looked different last week can
// still be explained, and so an accidental delete is recoverable.
export const DELETE = route(async (_request, { params }) => {
  const session = await requireSession();
  const { id, expenseId } = await params;
  const { group } = await requireGroup(id, session);

  const rows = await db()`
    update expenses set deleted_at = now()
    where id = ${expenseId} and group_id = ${group.id} and deleted_at is null
    returning id
  `;
  if (!rows.length) throw httpError('That expense is already gone', 404);

  return Response.json({ ok: true });
});
