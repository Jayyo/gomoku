-- Gomoku (오목) Database Setup
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

-- Index for fast room lookup
create index if not exists idx_rooms_code on rooms(code);
create index if not exists idx_rooms_status on rooms(status);
create index if not exists idx_moves_room_id on moves(room_id);

-- Enable Row Level Security
alter table rooms enable row level security;
alter table moves enable row level security;

-- RLS Policies (public access for anonymous play)
create policy "Anyone can read rooms" on rooms for select using (true);
create policy "Anyone can insert rooms" on rooms for insert with check (true);
create policy "Anyone can update rooms" on rooms for update using (true);
create policy "Anyone can delete rooms" on rooms for delete using (true);

create policy "Anyone can read moves" on moves for select using (true);
create policy "Anyone can insert moves" on moves for insert with check (true);

-- Enable Realtime
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table moves;

-- Auto-cleanup old rooms (older than 24 hours)
-- Run as a cron job or manually
-- delete from rooms where created_at < now() - interval '24 hours';
