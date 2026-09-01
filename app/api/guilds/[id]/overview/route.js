import { requireSession, route } from '@/lib/guard';
import { assertMembership } from '@/lib/discord';
import { loadGuildOverview } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

// Deliberately guild-scoped, not group-scoped: this spans every group in the
// server, including ones the visitor is not in. Being in the server is the
// whole entry requirement.
export const GET = route(async (_request, { params }) => {
  const session = await requireSession();
  const { id } = await params;
  await assertMembership(id, session.accessToken);

  const overview = await loadGuildOverview(id);
  return Response.json({ ...overview, me: session.userId });
});
