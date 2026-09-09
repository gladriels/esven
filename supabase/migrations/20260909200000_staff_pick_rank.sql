-- Apply in the reqly Supabase SQL Editor.
-- Manual sequencing for the Staff Picks feed tab: admins can reorder picks.
alter table public.requests
  add column if not exists staff_pick_rank integer;

create index if not exists requests_staff_pick_rank_idx
  on public.requests (staff_pick_rank)
  where staff_pick_rank is not null;
