-- Apply in the reqly Supabase SQL Editor.
-- Lets a profile owner hide their "Liked" tab from other visitors.
-- Profiles themselves stay public; this only gates the liked-posts list.
alter table public.profiles
  add column if not exists likes_are_public boolean not null default true;
