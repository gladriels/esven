# Reqly — social shopping requests (starter)

A Treffa-style app: people post "looking for X" requests, others reply with
recommendations, requester picks a favorite.

## Stack
- Frontend: plain HTML/CSS/vanilla JS (no build step, no framework)
- Backend: Supabase (Postgres + Auth + Storage), free tier
- Hosting: Vercel

## 1. Create a Supabase project
1. Go to https://supabase.com → New Project (free tier is fine)
2. Once created, go to Project Settings → API
3. Copy your **Project URL** and **anon public key**
4. Open `js/supabase-client.js` and paste them in

## 2. Create the database tables
Go to the Supabase dashboard → SQL Editor → paste and run this:

```sql
-- profiles: one row per user, auto-created on signup
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  created_at timestamptz default now()
);

-- requests: "looking for X" posts
create table requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  description text,
  budget text,
  category text,
  image_url text,
  status text default 'open', -- 'open' | 'closed'
  created_at timestamptz default now()
);

-- recommendations: replies to a request
create table recommendations (
  id uuid default gen_random_uuid() primary key,
  request_id uuid references requests(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  note text not null,
  link text,
  image_url text,
  is_favorite boolean default false,
  created_at timestamptz default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table requests enable row level security;
alter table recommendations enable row level security;

-- anyone can read; only owners can write their own rows
create policy "profiles are viewable by everyone" on profiles for select using (true);
create policy "users can insert their own profile" on profiles for insert with check (auth.uid() = id);

create policy "requests are viewable by everyone" on requests for select using (true);
create policy "users can insert their own requests" on requests for insert with check (auth.uid() = user_id);
create policy "users can update their own requests" on requests for update using (auth.uid() = user_id);

create policy "recommendations are viewable by everyone" on recommendations for select using (true);
create policy "users can insert their own recommendations" on recommendations for insert with check (auth.uid() = user_id);
create policy "requesters can mark favorite" on recommendations for update using (
  auth.uid() = (select user_id from requests where requests.id = request_id)
);

-- auto-create a profile row when someone signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## 2b. Add song attachment + audience tag (run in SQL Editor, one-time)

```sql
alter table requests add column spotify_url text;
alter table requests add column audience text;
```

## 2c. Enable image upload from device (run in SQL Editor, one-time)

```sql
insert into storage.buckets (id, name, public)
values ('request-images', 'request-images', true)
on conflict (id) do nothing;

create policy "public can view request images"
on storage.objects for select
using (bucket_id = 'request-images');

create policy "signed in users can upload request images"
on storage.objects for insert
with check (bucket_id = 'request-images' and auth.role() = 'authenticated');
```

## 2d. Allow deleting your own posts (run in SQL Editor, one-time)

```sql
create policy "users can delete their own requests"
on requests for delete
using (auth.uid() = user_id);

create policy "users can delete their own recommendations"
on recommendations for delete
using (auth.uid() = user_id);
```

## 3. Enable email auth
Dashboard → Authentication → Providers → Email → make sure it's enabled.
This starter uses magic-link (passwordless) login — simplest for v1.

## 4. Run it locally
No build step needed. Just open `index.html` with a local server, e.g.:

```
npx serve .
```

(Opening the HTML file directly with `file://` will break Supabase auth redirects —
always serve it over http://localhost.)

## 5. Deploy
Push to GitHub, import into Vercel, no build command needed — it's static files.

## File map
- `index.html` — feed of open requests + "post a request" form
- `request.html` — one request's detail + recommendations + reply form
- `css/style.css` — all styling
- `js/supabase-client.js` — your project URL/key go here
- `js/auth.js` — magic-link login/logout, shared across pages
- `js/app.js` — feed page logic
- `js/request.js` — request detail page logic

## Monetization: affiliate links

`js/affiliate-config.js` rewrites recommendation links to include your
affiliate tracking ID before they're saved — earns you a commission on
purchases, invisible to users. Sign up for an affiliate program (Amazon
Associates, Awin, Rakuten Advertising are good starting points), then paste
your tag into that file. Any store you haven't configured is left alone —
nothing breaks.

## What's next after this MVP
- Image upload (Supabase Storage) instead of pasted URLs
- Notifications when someone recommends on your request
- Search/filter by category
- Reputation score (count of favorited recommendations)
