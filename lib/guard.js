import { getSession } from '@/lib/session';
import { assertMembership } from '@/lib/discord';
import { db, int } from '@/lib/db';

export function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw httpError('Not signed in', 401);
  return session;
}

// Two checks, and both are load-bearing. Guild membership stops someone
// walking group ids belonging to a server they were never in; group
// membership stops anyone in the server reading a group they are not part of.
export async function requireGroup(groupId, session) {
  const sql = db();
  const [group] = await sql`
    select id, guild_id, name, currency, created_by
    from groups where id = ${groupId}
  `;
  if (!group) throw httpError('Group not found', 404);

  await assertMembership(group.guild_id, session.accessToken);

  const members = await sql`
    select discord_user_id, display_name, avatar_url
    from group_members where group_id = ${groupId}
    order by display_name
  `;
  if (!members.some((m) => m.discord_user_id === session.userId)) {
    throw httpError('You are not in that group', 403);
  }

  return {
    group: { ...group, id: int(group.id) },
    members: members.map((m) => ({
      id: m.discord_user_id,
      name: m.display_name,
      avatar: m.avatar_url,
    })),
  };
}

// Wraps a route handler so thrown errors carrying a .status become that
// response instead of an unhandled 500.
export function route(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (!err.status || err.status >= 500) console.error(err);
      return Response.json({ error: err.message }, { status: err.status ?? 500 });
    }
  };
}
