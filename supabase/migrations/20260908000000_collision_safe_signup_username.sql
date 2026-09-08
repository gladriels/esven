-- Apply in the reqly Supabase SQL Editor.
-- Fixes signup failures when two users share an email local-part (e.g. john@gmail.com vs john@work.com):
-- the old trigger inserted username = split_part(email,'@',1) into a UNIQUE column, so the second
-- signup's insert failed inside the same transaction as auth.users, silently blocking that user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text := regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g');
  candidate text;
  suffix int := 0;
begin
  if base_username = '' then
    base_username := 'user';
  end if;
  candidate := base_username;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := base_username || suffix::text;
  end loop;
  insert into public.profiles (id, username)
  values (new.id, candidate);
  return new;
end;
$$;
