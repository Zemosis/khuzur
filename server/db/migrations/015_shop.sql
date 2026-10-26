-- SHOP — what players buy with gold (docs/gold-economy.md), and the extra
-- painted-avatar slots, its first item.
--
-- A player starts with one slot (custom_avatar) and can buy two more; their
-- drawings are in extra_avatars, in slot order (null for a bought slot not
-- painted yet). avatar = 'custom' wears the painted avatar in custom_slot.

alter table profiles
  add column avatar_slots smallint not null default 1,
  add column extra_avatars jsonb not null default '[]',
  add column custom_slot smallint not null default 1,
  add constraint profiles_avatar_slots_range check (avatar_slots between 1 and 3),
  add constraint profiles_custom_slot_range check (custom_slot between 1 and avatar_slots),
  add constraint profiles_extra_avatars_shape
    check (jsonb_typeof(extra_avatars) = 'array' and jsonb_array_length(extra_avatars) <= avatar_slots - 1);

-- One row per item a player owns: what they paid and the gold left after.
create table shop_purchases (
  id bigserial primary key,
  user_id uuid not null references users (id) on delete cascade,
  item_id text not null,
  price integer not null check (price >= 0),
  gold_after integer not null check (gold_after >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);
create index shop_purchases_created_at_idx on shop_purchases (created_at);

-- Hidden from Supabase's Data API like every other table (003_lock_down.sql).
alter table shop_purchases enable row level security;
