-- Omok database setup
-- Run this in Supabase SQL Editor

-- Rooms table
create table if not exists rooms (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  host_name text not null,
  guest_name text,
  status text default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  current_turn text default 'black' check (current_turn in ('black', 'white')),
  winner text check (winner in ('black', 'white', null)),
  rules_type text default 'freestyle' check (rules_type in ('freestyle', 'renju')),
  bet_text text,
  bet_agreed boolean default false,
  rematch_code text,
  created_at timestamptz default now()
);

-- Moves table
create table if not exists moves (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references rooms(id) on delete cascade,
  player text not null check (player in ('black', 'white')),
  x int not null check (x >= 0 and x < 15),
  y int not null check (y >= 0 and y < 15),
  move_number int not null,
  created_at timestamptz default now()
);

-- Taunts table
create table if not exists taunts (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references rooms(id) on delete cascade,
  sender text not null,
  message text,
  taunt_type text,
  created_at timestamptz default now()
);

-- Hall of Fame table
create table if not exists hall_of_fame (
  id uuid default gen_random_uuid() primary key,
  room_id uuid,
  winner_name text not null,
  loser_name text not null,
  winner_role text not null,
  move_count int,
  rules_type text,
  bet_text text,
  replay_data jsonb,
  message text,
  winner_token text,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_rooms_code on rooms(code);
create index if not exists idx_rooms_status on rooms(status);
create index if not exists idx_moves_room_id on moves(room_id);
create index if not exists idx_taunts_room_id on taunts(room_id);
create index if not exists idx_hall_created on hall_of_fame(created_at desc);

-- Enable Row Level Security
alter table rooms enable row level security;
alter table moves enable row level security;
alter table taunts enable row level security;
alter table hall_of_fame enable row level security;

-- RLS Policies (public access for anonymous play)
create policy "Anyone can read rooms" on rooms for select using (true);
create policy "Anyone can insert rooms" on rooms for insert with check (true);
create policy "Anyone can update rooms" on rooms for update using (true);
create policy "Anyone can delete rooms" on rooms for delete using (true);

create policy "Anyone can read moves" on moves for select using (true);
create policy "Anyone can insert moves" on moves for insert with check (true);

create policy "Anyone can read taunts" on taunts for select using (true);
create policy "Anyone can insert taunts" on taunts for insert with check (true);

create policy "Anyone can read hall_of_fame" on hall_of_fame for select using (true);
create policy "Anyone can insert hall_of_fame" on hall_of_fame for insert with check (true);
create policy "Anyone can delete hall_of_fame" on hall_of_fame for delete using (true);

-- Enable Realtime
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table moves;
alter publication supabase_realtime add table taunts;

-- Migration for existing tables (run if tables already exist):
-- alter table rooms add column if not exists rules_type text default 'freestyle';
-- alter table rooms add column if not exists bet_text text;
-- alter table rooms add column if not exists bet_agreed boolean default false;
-- alter table rooms add column if not exists rematch_code text;

-- Auto-cleanup old rooms (older than 24 hours)
-- Run as a cron job or manually
-- delete from rooms where created_at < now() - interval '24 hours';
