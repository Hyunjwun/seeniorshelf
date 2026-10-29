-- SeniorShelf database setup for Supabase
-- Paste this whole file into Supabase Dashboard > SQL Editor > New query and Run.
-- Checkout records an order and reserves items; it does NOT collect payment.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'SeniorShelf member',
  active_role text not null default 'buyer' check (active_role in ('buyer','seller')),
  school_level text not null default 'SMA' check (school_level in ('SD','SMP','SMA','SMK','University')),
  grade text not null default '',
  semester integer check (semester is null or semester between 1 and 14),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, active_role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email, '@', 1), 'SeniorShelf member'),
    case when new.raw_user_meta_data->>'active_role' = 'seller' then 'seller' else 'buyer' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_seniorshelf on auth.users;
create trigger on_auth_user_created_seniorshelf
after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('Uniforms','Books','Stationery','Bags','Other')),
  school_level text not null check (school_level in ('SD','SMP','SMA','SMK','University')),
  grade text not null default '',
  condition text not null check (condition in ('Like new','Very good','Good','Fair')),
  price numeric(12,2) not null check (price >= 1000),
  description text not null default '',
  image_path text not null,
  status text not null default 'active' check (status in ('active','reserved','sold','unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_status_created_idx on public.products(status, created_at desc);
create index if not exists products_seller_idx on public.products(seller_id);

create table if not exists public.cart_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'placed' check (status in ('placed','cancelled','completed')),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists orders_buyer_idx on public.orders(buyer_id, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  product_name text not null,
  price numeric(12,2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);
create index if not exists order_items_seller_idx on public.order_items(seller_id);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists conversations_buyer_idx on public.conversations(buyer_id, created_at desc);
create index if not exists conversations_seller_idx on public.conversations(seller_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 1000),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists offers_seller_idx on public.offers(seller_id, status, created_at desc);

-- Enable row-level security on all user data.
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.offers enable row level security;

-- Profiles: authenticated users can see names on listings and edit only their own profile.
drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());

-- Products: authenticated community can view active listings; sellers manage only their own listings.
drop policy if exists "View active products and own products" on public.products;
create policy "View active products and own products" on public.products for select to authenticated using (status = 'active' or seller_id = auth.uid());
drop policy if exists "Seller inserts own products" on public.products;
create policy "Seller inserts own products" on public.products for insert to authenticated with check (seller_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active_role = 'seller'));
drop policy if exists "Seller updates own products" on public.products;
create policy "Seller updates own products" on public.products for update to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());
drop policy if exists "Seller deletes own products" on public.products;
create policy "Seller deletes own products" on public.products for delete to authenticated using (seller_id = auth.uid() and status in ('active','unavailable'));

-- Cart is private to its owner.
drop policy if exists "Users view own cart" on public.cart_items;
create policy "Users view own cart" on public.cart_items for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users add own cart items" on public.cart_items;
create policy "Users add own cart items" on public.cart_items for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.products p where p.id = product_id and p.status = 'active' and p.seller_id <> auth.uid()));
drop policy if exists "Users remove own cart items" on public.cart_items;
create policy "Users remove own cart items" on public.cart_items for delete to authenticated using (user_id = auth.uid());

-- Orders and order items can be read only by the buyer or relevant seller.
drop policy if exists "Buyer views own orders" on public.orders;
create policy "Buyer views own orders" on public.orders for select to authenticated using (buyer_id = auth.uid());
drop policy if exists "Participants view order items" on public.order_items;
create policy "Participants view order items" on public.order_items for select to authenticated using (seller_id = auth.uid() or exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid()));

-- Conversations and messages are limited to their buyer/seller participants.
drop policy if exists "Participants view conversations" on public.conversations;
create policy "Participants view conversations" on public.conversations for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid());
drop policy if exists "Participants view messages" on public.messages;
create policy "Participants view messages" on public.messages for select to authenticated using (exists (select 1 from public.conversations c where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())));
drop policy if exists "Participants send messages" on public.messages;
create policy "Participants send messages" on public.messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.conversations c where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())));

-- Offers: buyer creates their own offer, both parties can view, seller alone can respond.
drop policy if exists "Offer parties can view offers" on public.offers;
create policy "Offer parties can view offers" on public.offers for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid());
drop policy if exists "Buyer creates offer on active listing" on public.offers;
create policy "Buyer creates offer on active listing" on public.offers for insert to authenticated with check (buyer_id = auth.uid() and seller_id <> auth.uid() and status = 'pending' and exists (select 1 from public.products p where p.id = product_id and p.seller_id = seller_id and p.status = 'active' and amount < p.price));
drop policy if exists "Seller responds to own offers" on public.offers;
-- Responses use a narrowly scoped RPC below so the seller cannot edit offer amount/participants.

-- Public bucket for listing photos. Upload paths must start with the user's auth UID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];
drop policy if exists "Anyone can view product images" on storage.objects;
create policy "Anyone can view product images" on storage.objects for select using (bucket_id = 'product-images');
drop policy if exists "Users upload own product images" on storage.objects;
create policy "Users upload own product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update own product images" on storage.objects;
create policy "Users update own product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete own product images" on storage.objects;
create policy "Users delete own product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Checkout RPC validates the entire cart, reserves items, creates order records,
-- and opens one conversation per purchased item in one database transaction.
create or replace function public.checkout_cart(product_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order uuid;
  v_expected integer;
  v_changed integer;
  v_total numeric(12,2);
begin
  if v_user is null then raise exception 'Please log in before checkout.'; end if;
  if product_ids is null or cardinality(product_ids) = 0 then raise exception 'Your cart is empty.'; end if;
  if cardinality(product_ids) <> (select count(distinct item_id) from unnest(product_ids) as ids(item_id)) then raise exception 'Duplicate items in checkout.'; end if;

  v_expected := cardinality(product_ids);
  if (select count(*) from public.cart_items ci where ci.user_id = v_user and ci.product_id = any(product_ids)) <> v_expected then
    raise exception 'Refresh your cart before checkout.';
  end if;

  update public.products
    set status = 'reserved', updated_at = now()
    where id = any(product_ids) and status = 'active' and seller_id <> v_user;
  get diagnostics v_changed = row_count;
  if v_changed <> v_expected then raise exception 'One or more items are no longer available. Refresh your cart.'; end if;

  select coalesce(sum(price),0) into v_total from public.products where id = any(product_ids) and status = 'reserved';
  insert into public.orders (buyer_id, status, total_amount) values (v_user, 'placed', v_total) returning id into v_order;

  insert into public.order_items (order_id, product_id, seller_id, product_name, price)
    select v_order, p.id, p.seller_id, p.name, p.price from public.products p where p.id = any(product_ids);

  insert into public.conversations (order_item_id, buyer_id, seller_id, product_id)
    select oi.id, v_user, oi.seller_id, oi.product_id from public.order_items oi where oi.order_id = v_order;

  delete from public.cart_items where user_id = v_user and product_id = any(product_ids);
  return v_order;
end;
$$;
revoke all on function public.checkout_cart(uuid[]) from public;
grant execute on function public.checkout_cart(uuid[]) to authenticated;

create or replace function public.respond_to_offer(p_offer_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_rows integer;
begin
  if auth.uid() is null then raise exception 'Please log in.'; end if;
  if p_status not in ('accepted','rejected') then raise exception 'Invalid offer response.'; end if;
  update public.offers set status = p_status, updated_at = now()
    where id = p_offer_id and seller_id = auth.uid() and status = 'pending';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Offer not found or already answered.'; end if;
end;
$$;
revoke all on function public.respond_to_offer(uuid,text) from public;
grant execute on function public.respond_to_offer(uuid,text) to authenticated;

-- Enable Realtime updates for new messages (safe to run repeatedly).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
