-- Omok online play: database setup for a new Supabase project.
-- Run it in the SQL editor. Running it again is safe.
--
-- There are no accounts. Anyone with the publishable key can create, join and play rooms,
-- so these rules only keep the data consistent: room codes and names have a fixed shape,
-- moves go in order with alternating colors and one stone per point, rooms move
-- waiting -> playing -> finished, and a hall of fame entry can only be removed with the
-- token its winner got. They do not stop a modified client from cheating
-- (playing for the other side, claiming a win, ignoring Renju forbidden moves).

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_name text not null check (char_length(host_name) between 1 and 20),
  host_role text not null default 'black' check (host_role in ('black', 'white')),
  guest_name text check (char_length(guest_name) between 1 and 20),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  winner text check (winner in ('black', 'white')),
  rules_type text not null default 'freestyle' check (rules_type in ('freestyle', 'renju')),
  bet_text text check (char_length(bet_text) between 1 and 100),
  bet_agreed boolean not null default false,
  rematch_code text check (rematch_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.moves (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  player text not null check (player in ('black', 'white')),
  x int not null check (x between 0 and 14),
  y int not null check (y between 0 and 14),
  move_number int not null check (move_number between 1 and 225),
  created_at timestamptz not null default now(),
  unique (room_id, move_number),
  unique (room_id, x, y),
  -- Black plays the odd moves, White the even ones
  check ((move_number % 2 = 1) = (player = 'black'))
);

create table if not exists public.taunts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  sender text not null check (char_length(sender) between 1 and 20),
  message text check (char_length(message) <= 60),
  taunt_type text not null check (taunt_type ~ '^[a-z_]{1,32}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.hall_of_fame (
  id uuid primary key default gen_random_uuid(),
  room_id uuid unique references public.rooms (id) on delete set null,
  winner_name text not null check (char_length(winner_name) between 1 and 20),
  loser_name text not null check (char_length(loser_name) between 1 and 20),
  winner_role text not null check (winner_role in ('black', 'white')),
  move_count int check (move_count between 1 and 225),
  rules_type text not null default 'freestyle' check (rules_type in ('freestyle', 'renju')),
  bet_text text check (char_length(bet_text) <= 100),
  replay_data jsonb check (jsonb_typeof(replay_data) = 'array' and jsonb_array_length(replay_data) <= 225),
  message text check (char_length(message) <= 100),
  winner_token text not null check (winner_token ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default now()
);

create index if not exists idx_rooms_status on public.rooms (status, created_at desc);
create index if not exists idx_moves_room on public.moves (room_id, move_number);
create index if not exists idx_taunts_room on public.taunts (room_id);
create index if not exists idx_hall_created on public.hall_of_fame (created_at desc);

-- Allowed room changes: waiting -> playing (a guest joins), playing -> finished,
-- and on a finished room only setting the rematch code. Nothing else may change.
create or replace function public.check_room_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.code <> old.code or new.host_name <> old.host_name
     or new.host_role <> old.host_role or new.rules_type <> old.rules_type
     or new.bet_text is distinct from old.bet_text or new.created_at <> old.created_at then
    raise exception 'room settings cannot be changed';
  end if;

  if old.status = 'waiting' and new.status = 'playing' then
    if new.guest_name is null or new.guest_name = new.host_name or new.winner is not null
       or new.rematch_code is not null then
      raise exception 'invalid join';
    end if;
    return new;
  end if;

  if new.guest_name is distinct from old.guest_name or new.bet_agreed <> old.bet_agreed then
    raise exception 'players cannot be changed';
  end if;

  if old.status = 'playing' and new.status = 'finished' and new.rematch_code is null then
    return new;
  end if;

  if old.status = 'finished' and new.status = 'finished' and new.winner is not distinct from old.winner
     and (old.rematch_code is null or new.rematch_code = old.rematch_code) then
    return new;
  end if;

  if new.status = old.status and new.winner is not distinct from old.winner
     and new.rematch_code is not distinct from old.rematch_code then
    return new;
  end if;

  raise exception 'invalid room change from % to %', old.status, new.status;
end;
$$;

drop trigger if exists rooms_check_update on public.rooms;
create trigger rooms_check_update before update on public.rooms
  for each row execute function public.check_room_update();

-- Row level security
alter table public.rooms enable row level security;
alter table public.moves enable row level security;
alter table public.taunts enable row level security;
alter table public.hall_of_fame enable row level security;

drop policy if exists "rooms are public" on public.rooms;
drop policy if exists "anyone can open a room" on public.rooms;
drop policy if exists "rooms change through the trigger rules" on public.rooms;
drop policy if exists "only waiting rooms can be deleted" on public.rooms;
create policy "rooms are public" on public.rooms for select using (true);
create policy "anyone can open a room" on public.rooms for insert
  with check (status = 'waiting' and guest_name is null and winner is null
              and rematch_code is null and bet_agreed = false);
create policy "rooms change through the trigger rules" on public.rooms for update using (true) with check (true);
create policy "only waiting rooms can be deleted" on public.rooms for delete using (status = 'waiting');

drop policy if exists "moves are public" on public.moves;
drop policy if exists "moves go in order while playing" on public.moves;
create policy "moves are public" on public.moves for select using (true);
create policy "moves go in order while playing" on public.moves for insert
  with check (
    exists (select 1 from public.rooms r where r.id = moves.room_id and r.status = 'playing')
    and (moves.move_number = 1 or exists (
      select 1 from public.moves m
      where m.room_id = moves.room_id and m.move_number = moves.move_number - 1
    ))
  );

drop policy if exists "taunts are public" on public.taunts;
drop policy if exists "taunts in started rooms" on public.taunts;
create policy "taunts are public" on public.taunts for select using (true);
create policy "taunts in started rooms" on public.taunts for insert
  with check (exists (
    select 1 from public.rooms r where r.id = taunts.room_id and r.status in ('playing', 'finished')
  ));

drop policy if exists "hall of fame is public" on public.hall_of_fame;
drop policy if exists "winners can add their game" on public.hall_of_fame;
create policy "hall of fame is public" on public.hall_of_fame for select using (true);
create policy "winners can add their game" on public.hall_of_fame for insert
  with check (exists (
    select 1 from public.rooms r
    where r.id = hall_of_fame.room_id and r.status = 'finished' and r.winner = hall_of_fame.winner_role
  ));

-- The delete token must stay private, so it is not selectable
revoke all on public.hall_of_fame from anon, authenticated;
grant select (id, room_id, winner_name, loser_name, winner_role, move_count, rules_type, bet_text,
              replay_data, message, created_at)
  on public.hall_of_fame to anon, authenticated;
grant insert (room_id, winner_name, loser_name, winner_role, move_count, rules_type, bet_text,
              replay_data, message, winner_token)
  on public.hall_of_fame to anon, authenticated;

create or replace function public.delete_hall_entry(entry_id uuid, token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with removed as (
    delete from public.hall_of_fame where id = entry_id and winner_token = token returning 1
  )
  select exists (select 1 from removed);
$$;

revoke all on function public.delete_hall_entry(uuid, text) from public;
grant execute on function public.delete_hall_entry(uuid, text) to anon, authenticated;

-- Realtime updates for the game page
do $$
declare
  t text;
begin
  foreach t in array array['rooms', 'moves', 'taunts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Old rooms are not removed automatically. With pg_cron enabled, something like:
--   select cron.schedule('omok-cleanup', '0 4 * * *',
--     $$delete from public.rooms where created_at < now() - interval '2 days'$$);
