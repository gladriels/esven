-- Applied via Supabase MCP; kept here for repo history.
-- Private one-on-one messaging: conversations, messages, and web push subscriptions.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_min uuid not null references public.profiles(id) on delete cascade,
  user_max uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  constraint conversations_ordered_pair check (user_min < user_max),
  constraint conversations_unique_pair unique (user_min, user_max)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);
create index if not exists conversations_user_max_idx on public.conversations (user_max);
create index if not exists messages_sender_id_idx on public.messages (sender_id);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;

-- auth.uid() is wrapped in a scalar subselect below so it's evaluated once
-- per query instead of once per row (see Supabase's auth_rls_initplan lint).

drop policy if exists "participants can view their conversations" on public.conversations;
create policy "participants can view their conversations"
on public.conversations for select to authenticated
using ((select auth.uid()) = user_min or (select auth.uid()) = user_max);

drop policy if exists "participants can view their messages" on public.messages;
create policy "participants can view their messages"
on public.messages for select to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = messages.conversation_id
    and ((select auth.uid()) = c.user_min or (select auth.uid()) = c.user_max)
));

drop policy if exists "participants can send messages" on public.messages;
create policy "participants can send messages"
on public.messages for insert to authenticated
with check (
  (select auth.uid()) = sender_id
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and ((select auth.uid()) = c.user_min or (select auth.uid()) = c.user_max)
  )
);

drop policy if exists "manage own push subscriptions" on public.push_subscriptions;
create policy "manage own push subscriptions"
on public.push_subscriptions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- All conversation/read-state writes go through these security-definer
-- functions rather than direct table access, so RLS on conversations/messages
-- never needs an insert/update policy beyond the ones above.

create or replace function public.get_or_create_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  lo uuid;
  hi uuid;
  convo_id uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if me = other_user_id then
    raise exception 'cannot message yourself';
  end if;

  if me < other_user_id then
    lo := me; hi := other_user_id;
  else
    lo := other_user_id; hi := me;
  end if;

  select id into convo_id from public.conversations where user_min = lo and user_max = hi;
  if convo_id is null then
    insert into public.conversations (user_min, user_max) values (lo, hi)
    returning id into convo_id;
  end if;

  return convo_id;
end;
$$;

revoke all on function public.get_or_create_conversation(uuid) from public;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id <> me
    and read_at is null
    and exists (
      select 1 from public.conversations c
      where c.id = p_conversation_id
        and (c.user_min = me or c.user_max = me)
    );
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 200)
  where id = new.conversation_id;
  return new;
end;
$$;

-- Trigger functions aren't meant to be invoked directly (Postgres rejects
-- calling them outside trigger context anyway), but revoke EXECUTE from
-- PUBLIC so they don't show up as callable RPC endpoints in the API.
revoke execute on function public.touch_conversation_on_message() from public;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_on_message();

-- Realtime respects each table's RLS for the connected user, so enabling
-- replication here is enough for postgres_changes subscriptions to work
-- without exposing anyone else's conversations or messages.
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
