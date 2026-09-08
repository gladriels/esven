-- Apply in the reqly Supabase SQL Editor.
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

alter table public.follows enable row level security;

drop policy if exists "follows are viewable by everyone" on public.follows;
create policy "follows are viewable by everyone"
on public.follows for select using (true);

drop policy if exists "members can follow" on public.follows;
create policy "members can follow"
on public.follows for insert to authenticated
with check (auth.uid() = follower_id and auth.uid() <> following_id);

drop policy if exists "members can unfollow" on public.follows;
create policy "members can unfollow"
on public.follows for delete to authenticated
using (auth.uid() = follower_id);
