create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_mnt integer not null check (price_mnt > 0),
  image_url text,
  image_width integer,
  image_height integer,
  sizes text[],
  stock_count integer,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  size text,
  quantity integer not null default 1 check (quantity > 0),
  price_mnt integer not null,
  total_mnt integer not null,
  contact_phone text,
  shipping_address text,
  status text not null default 'pending' check (status in ('pending','paid','fulfilled','cancelled')),
  qpay_invoice_id text,
  created_at timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_product_id_idx on public.orders(product_id);
create index if not exists products_active_sort_idx on public.products(is_active, sort_order);

alter table public.products enable row level security;
alter table public.orders enable row level security;

drop policy if exists "active products are public, admins see all" on public.products;
create policy "active products are public, admins see all"
on public.products for select
using (
  is_active = true
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "only admins write products" on public.products;
create policy "only admins write products"
on public.products for all
to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "users see own orders, admins see all" on public.orders;
create policy "users see own orders, admins see all"
on public.orders for select
to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "users create their own pending orders" on public.orders;
create policy "users create their own pending orders"
on public.orders for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending');

-- No client-side update/delete policy on orders: payment confirmation and
-- fulfillment are done by the Cloudflare functions using the service-role
-- key, which bypasses RLS entirely — this isn't a gap.
