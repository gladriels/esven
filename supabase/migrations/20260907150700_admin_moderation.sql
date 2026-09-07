-- Apply in the reqly Supabase project's SQL Editor before deploying the admin UI.
-- This migration intentionally stops if @gladriel does not identify exactly one profile.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admins can delete any request" on public.requests;
create policy "admins can delete any request"
on public.requests for delete to authenticated
using (public.is_admin());

drop policy if exists "admins can delete any recommendation" on public.recommendations;
create policy "admins can delete any recommendation"
on public.recommendations for delete to authenticated
using (public.is_admin());

do $$
declare profile_count integer;
begin
  select count(*) into profile_count from public.profiles where username = 'gladriel';
  if profile_count <> 1 then
    raise exception 'Expected exactly one profile named @gladriel; found %', profile_count;
  end if;
  update public.profiles set is_admin = true where username = 'gladriel';
end;
$$;
