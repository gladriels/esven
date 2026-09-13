-- Apply in the reqly Supabase SQL Editor.
-- Persist uploaded image dimensions so the feed can render <img width height>
-- and reserve exact layout space before the bytes arrive. Without this the
-- masonry measures zero-height images, lays out wrong, then re-lays-out on
-- every image load — which is the visible "jumping" when new posts appear.
alter table public.requests
  add column if not exists image_width integer,
  add column if not exists image_height integer;

alter table public.recommendations
  add column if not exists image_width integer,
  add column if not exists image_height integer;
