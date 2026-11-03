import { db, int } from '@/lib/db';
import { requireSession, route, httpError } from '@/lib/guard';
import { assertMembership, fetchAllMembers } from '@/lib/discord';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  const session = await requireSession();
  const guildId = new URL(request.url).searchParams.get('guildId');
  if (!guildId) throw httpError('guildId is required', 400);

  await assertMembership(guildId, session.accessToken);

  const me = session.userId;

  // Only groups the visitor is actually a member of. For direct tabs, `other`
  // is the person on the far side; `my_net` is the visitor's balance there.
  const rows = await db()`
    select g.id, g.name, g.currency, g.kind,
           count(m.discord_user_id) as member_count,
           (array_agg(json_build_object('id', m.discord_user_id, 'name', m.display_name, 'avatar', m.avatar_url))
              filter (where m.discord_user_id <> ${me}))[1] as other,
           coalesce((select sum(e.amount_cents) from expenses e
                     where e.group_id = g.id and e.payer_id = ${me} and e.deleted_at is null), 0)
         - coalesce((select sum(s.amount_cents) from expense_shares s join expenses e on e.id = s.expense_id
                     where e.group_id = g.id and s.discord_user_id = ${me} and e.deleted_at is null), 0)
         + coalesce((select sum(st.amount_cents) from settlements st
                     where st.group_id = g.id and st.from_user_id = ${me} and st.deleted_at is null), 0)
         - coalesce((select sum(st.amount_cents) from settlements st
                     where st.group_id = g.id and st.to_user_id = ${me} and st.deleted_at is null), 0)
           as my_net
    from groups g
    join group_members m on m.group_id = g.id
    where g.guild_id = ${guildId}
      and exists (
        select 1 from group_members mine
        where mine.group_id = g.id and mine.discord_user_id = ${me}
      )
    group by g.id
    order by g.created_at desc
  `;

  return Response.json({
    groups: rows.map((g) => ({
      ...g,
      id: int(g.id),
      member_count: int(g.member_count),
      my_net: int(g.my_net),
    })),
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
