import { db, int } from '@/lib/db';
import { requireSession, route, httpError } from '@/lib/guard';
import { assertMembership, fetchAllMembers } from '@/lib/discord';

export const dynamic = 'force-dynamic';

// Opens the private tab between the visitor and one other person, creating it
// on first use. Returns the same group every time for the same pair.
export const POST = route(async (request) => {
  const session = await requireSession();
  const { guildId, userId } = await request.json();

  if (!guildId || !userId) throw httpError('guildId and userId are required', 400);
  if (userId === session.userId) throw httpError('Pick someone other than yourself', 400);

  await assertMembership(guildId, session.accessToken);

  const roster = new Map((await fetchAllMembers(guildId)).map((m) => [m.id, m]));
  const me = roster.get(session.userId);
  const them = roster.get(userId);
  if (!me || !them) throw httpError('That person is not in this server', 400);

  const pairKey = [session.userId, userId].sort().join(':');
  const sql = db();

  // One statement, so the group never exists without its two members.
  const [created] = await sql`
    with g as (
      insert into groups (guild_id, name, created_by, kind, pair_key)
      values (${guildId}, ${`${me.name} & ${them.name}`.slice(0, 80)}, ${session.userId}, 'direct', ${pairKey})
      on conflict (guild_id, pair_key) do nothing
      returning id
    ), m as (
      insert into group_members (group_id, discord_user_id, display_name, avatar_url)
      select g.id, u.id, u.name, u.avatar
      from g, (values
        (${me.id}, ${me.name}, ${me.avatar}),
        (${them.id}, ${them.name}, ${them.avatar})
      ) as u(id, name, avatar)
    )
    select id from g
  `;
  if (created) return Response.json({ id: int(created.id) }, { status: 201 });

  const [existing] = await sql`
    select id from groups where guild_id = ${guildId} and pair_key = ${pairKey}
  `;
  return Response.json({ id: int(existing.id) });
});
