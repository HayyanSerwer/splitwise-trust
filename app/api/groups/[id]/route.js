import { db } from '@/lib/db';
import { requireSession, requireGroup, route, httpError } from '@/lib/guard';
import { loadSummary } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

export const GET = route(async (_request, { params }) => {
  const session = await requireSession();
  const { id } = await params;
  const { group, members } = await requireGroup(id, session);
  const summary = await loadSummary(group.id, members);
  return Response.json({ group, members, ...summary, me: session.userId });
});

export const PATCH = route(async (request, { params }) => {
  const session = await requireSession();
  const { id } = await params;
  const { group, members } = await requireGroup(id, session);
  const { archived } = await request.json();
  if (typeof archived !== 'boolean') throw httpError('archived must be a boolean', 400);
  if (group.kind === 'direct') throw httpError('Only groups can be archived', 400);

  if (archived) {
    const { balances } = await loadSummary(group.id, members);
    if (balances.some((b) => b.net !== 0)) {
      throw httpError('Settle all balances before archiving this group', 409);
    }
  }

  await db()`
    update groups set archived_at = ${archived ? new Date().toISOString() : null}::timestamptz
    where id = ${group.id}
  `;
  return Response.json({ ok: true });
});
