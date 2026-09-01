-- Hisaab schema. Money is stored as integer cents everywhere; floats never
-- touch an amount. Expenses and settlements are soft-deleted so a disputed
-- balance can always be traced back through the ledger that produced it.

create table if not exists groups (
  id         bigserial primary key,
  guild_id   text        not null,
  name       text        not null,
  currency   text        not null default 'EUR',
  created_by text        not null,
  created_at timestamptz not null default now()
);

create index if not exists groups_guild_idx on groups (guild_id);

create table if not exists group_members (
  group_id        bigint not null references groups (id) on delete cascade,
  discord_user_id text   not null,
  display_name    text   not null,
  avatar_url      text,
  primary key (group_id, discord_user_id)
);

create table if not exists expenses (
  id           bigserial primary key,
  group_id     bigint      not null references groups (id) on delete cascade,
  payer_id     text        not null,
  amount_cents bigint      not null check (amount_cents > 0),
  description  text        not null,
  split_type   text        not null default 'equal',
  created_by   text        not null,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists expenses_group_idx
  on expenses (group_id, created_at desc) where deleted_at is null;

-- One row per person the expense is split across. These must always sum to
-- the parent expense's amount_cents; see allocate() in lib/money.js.
create table if not exists expense_shares (
  expense_id      bigint not null references expenses (id) on delete cascade,
  discord_user_id text   not null,
  amount_cents    bigint not null check (amount_cents >= 0),
  primary key (expense_id, discord_user_id)
);

create table if not exists settlements (
  id           bigserial primary key,
  group_id     bigint      not null references groups (id) on delete cascade,
  from_user_id text        not null,
  to_user_id   text        not null,
  amount_cents bigint      not null check (amount_cents > 0),
  created_by   text        not null,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  check (from_user_id <> to_user_id)
);

create index if not exists settlements_group_idx
  on settlements (group_id, created_at desc) where deleted_at is null;
