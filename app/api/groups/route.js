import { db, int } from '@/lib/db';
import { requireSession, route, httpError } from '@/lib/guard';
import { assertMembership, fetchAllMembers } from '@/lib/discord';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  const session = await requireSession();
  const guildId = new URL(request.url).searchParams.get('guildId');
  if (!guildId) throw httpError('guildId is required', 400);

  await assertMembership(guildId, session.accessToken);

  // Only groups the visitor is actually a member of.
  const rows = await db()`
    select g.id, g.name, g.currency, count(m.discord_user_id) as member_count
    from groups g
    join group_members m on m.group_id = g.id
    where g.guild_id = ${guildId}
      and exists (
        select 1 from group_members me
        where me.group_id = g.id and me.discord_user_id = ${session.userId}
      )
    group by g.id
    order by g.created_at desc
  `;

  return Response.json({
    groups: rows.map((g) => ({ ...g, id: int(g.id), member_count: int(g.member_count) })),
  });
});

export const POST = route(async (request) => {
  const session = await requireSession();
  const { guildId, name, memberIds } = await request.json();

  if (!guildId || !name?.trim()) throw httpError('guildId and name are required', 400);
  if (!Array.isArray(memberIds) || memberIds.length < 2) {
    throw httpError('Pick at least two people', 400);
  }

  await assertMembership(guildId, session.accessToken);

  // Resolve ids against the real roster rather than trusting the client, so a
  // forged id cannot plant a phantom member who accrues debts nobody can pay.
  const roster = new Map((await fetchAllMembers(guildId)).map((m) => [m.id, m]));
  const ids = [...new Set([...memberIds, session.userId])];
  const unknown = ids.filter((id) => !roster.has(id));
  if (unknown.length) throw httpError('Some of those people are not in this server', 400);

  const sql = db();
  const [group] = await sql`
    insert into groups (guild_id, name, created_by)
    values (${guildId}, ${name.trim().slice(0, 80)}, ${session.userId})
    returning id
  `;

  await sql`
    insert into group_members (group_id, discord_user_id, display_name, avatar_url)
    select ${int(group.id)}, u.id, u.name, u.avatar
    from unnest(
      ${ids}::text[],
      ${ids.map((id) => roster.get(id).name)}::text[],
      ${ids.map((id) => roster.get(id).avatar)}::text[]
    ) as u(id, name, avatar)
  `;

  return Response.json({ id: int(group.id) }, { status: 201 });
});
