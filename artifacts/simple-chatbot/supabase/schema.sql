-- Before using the app, enable Anonymous Sign-Ins in:
-- Supabase Dashboard > Authentication > Sign In / Providers.
-- Run this script once in the Supabase SQL Editor.

create table if not exists public.chat_messages (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('assistant', 'user')),
  content text not null check (char_length(content) <= 1200),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

grant usage on schema public to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;

drop policy if exists "chat messages are readable by their owner"
  on public.chat_messages;
create policy "chat messages are readable by their owner"
  on public.chat_messages
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "chat messages are insertable by their owner"
  on public.chat_messages;
create policy "chat messages are insertable by their owner"
  on public.chat_messages
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "chat messages are deletable by their owner"
  on public.chat_messages;
create policy "chat messages are deletable by their owner"
  on public.chat_messages
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
