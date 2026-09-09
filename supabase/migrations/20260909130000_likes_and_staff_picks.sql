-- Apply in the reqly Supabase SQL Editor.

-- Likes on requests (any signed-in member can like any request, including their own).
create table if not exists public.likes (
  request_id uuid not null references public.requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

alter table public.likes enable row level security;

drop policy if exists "likes are viewable by everyone" on public.likes;
create policy "likes are viewable by everyone"
on public.likes for select using (true);

drop policy if exists "members can like" on public.likes;
create policy "members can like"
on public.likes for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "members can unlike" on public.likes;
create policy "members can unlike"
on public.likes for delete to authenticated
using (auth.uid() = user_id);

-- Staff picks: editorial curation flag, separate from the paid "is_sponsored" promotion.
alter table public.requests
  add column if not exists is_staff_pick boolean not null default false;

drop policy if exists "admins can update any request" on public.requests;
create policy "admins can update any request"
on public.requests for update to authenticated
using (public.is_admin())
with check (public.is_admin());
