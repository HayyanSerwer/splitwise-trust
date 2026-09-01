import { requireSession, requireGroup, route } from '@/lib/guard';
import { loadSummary } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

export const GET = route(async (_request, { params }) => {
  const session = await requireSession();
  const { id } = await params;
  const { group, members } = await requireGroup(id, session);
  const summary = await loadSummary(group.id, members);
  return Response.json({ group, members, ...summary, me: session.userId });
});
