-- ============================================================
-- บันทึกรายรับรายจ่าย — Supabase schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Single-shop model: any authenticated (logged-in) user can read/write
-- everything — there is no per-user/per-tenant data separation.
--
-- Design notes carried over from the QA pass on the original app:
--  - Sales/stock-in are never hard-deleted — they are reversed (new
--    offsetting movement + transaction marked status='cancelled') so the
--    audit trail stays intact.
--  - Every stock-changing action goes through a SECURITY INVOKER RPC
--    function that locks the row (FOR UPDATE) before checking/changing
--    stock, so two rapid sells of the last 2 units can never both
--    succeed (the race condition app-side "check then write" code
--    cannot fully close).
--  - stock_movements.unit_cost is a snapshot at the time of that
--    movement, so shrinkage value stays correct even if the product's
--    cost is edited later.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- PRODUCTS ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  has_variants boolean not null default false,
  item_code text,
  normal_price numeric(12,2),
  sale_price numeric(12,2),
  cost numeric(12,2),
  stock integer not null default 0,
  min_stock integer not null default 3,
  image_url text,
  active boolean not null default true,   -- archive instead of hard delete (never drop products that have history)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_price_chk check (normal_price is null or normal_price > 0),
  constraint products_sale_chk check (sale_price is null or (sale_price > 0 and (normal_price is null or sale_price < normal_price))),
  constraint products_cost_chk check (cost is null or cost >= 0),
  constraint products_stock_chk check (stock >= 0),
  constraint products_minstock_chk check (min_stock >= 0)
);

-- ---------- PRODUCT VARIANTS ----------
create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  item_code text,
  color text,
  size text,
  normal_price numeric(12,2) not null,
  sale_price numeric(12,2),
  cost numeric(12,2),
  stock integer not null default 0,
  min_stock integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint variants_price_chk check (normal_price > 0),
  constraint variants_sale_chk check (sale_price is null or (sale_price > 0 and sale_price < normal_price)),
  constraint variants_cost_chk check (cost is null or cost >= 0),
  constraint variants_stock_chk check (stock >= 0),
  constraint variants_minstock_chk check (min_stock >= 0)
);
create index if not exists idx_variants_product on product_variants(product_id);

-- ---------- TRANSACTIONS ----------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  type text not null check (type in ('income','expense')),
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  note text,
  product_id uuid references products(id),
  variant_id uuid references product_variants(id),
  qty integer,
  cost numeric(12,2),              -- total cost-of-goods for this line, snapshotted at sale time; null = unknown cost, never counted as profit
  status text not null default 'active' check (status in ('active','cancelled')),
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_txn_date on transactions(date);
create index if not exists idx_txn_status on transactions(status);
create index if not exists idx_txn_product on transactions(product_id);

-- ---------- STOCK MOVEMENTS ----------
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  product_id uuid references products(id),
  variant_id uuid references product_variants(id),
  product_name text not null,      -- denormalized so history still reads fine if a product is later archived/renamed
  variant_label text,
  type text not null check (type in ('in','out','adjust','reversal')),
  qty integer not null,            -- signed delta
  before_qty integer not null,
  after_qty integer not null,
  unit_cost numeric(12,2),         -- cost AT THE TIME of this movement — used for shrinkage value even if product cost later changes
  reason text,
  note text,
  related_txn_id uuid references transactions(id),
  reversed_at timestamptz,         -- set when this movement itself has been reversed (stock-in cancellation), so it can't be reversed twice
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_mv_product on stock_movements(product_id);
create index if not exists idx_mv_txn on stock_movements(related_txn_id);

-- ---------- BUDGET (one row per month) ----------
create table if not exists budget (
  id uuid primary key default gen_random_uuid(),
  month text not null unique,      -- 'YYYY-MM'
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- ASSETS ----------
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  value numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- NOTES ----------
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  text text not null,
  created_at timestamptz not null default now()
);

-- ---------- COMBOS (repeat-sell sets) ----------
create table if not exists combos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  items jsonb not null,            -- [{product_id, variant_id, qty}]
  created_at timestamptz not null default now()
);

-- ---------- FAVORITES (quick income/expense presets) ----------
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income','expense')),
  category text not null,
  label text,
  created_at timestamptz not null default now()
);

-- ---------- APP SETTINGS (single shared row) ----------
create table if not exists app_settings (
  id int primary key default 1,
  theme text not null default 'purple',
  dark_mode boolean not null default false,
  notify_success boolean not null default true,
  item_code_seq integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY — single shop: any signed-in user, full access.
-- ============================================================
alter table products          enable row level security;
alter table product_variants  enable row level security;
alter table transactions      enable row level security;
alter table stock_movements   enable row level security;
alter table budget            enable row level security;
alter table assets            enable row level security;
alter table notes             enable row level security;
alter table combos            enable row level security;
alter table favorites         enable row level security;
alter table app_settings      enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['products','product_variants','transactions','stock_movements','budget','assets','notes','combos','favorites','app_settings'])
  loop
    execute format('drop policy if exists "authenticated full access" on %I', t);
    execute format('create policy "authenticated full access" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t);
  end loop;
end $$;

-- ============================================================
-- STORAGE — product photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product-images public read" on storage.objects;
create policy "product-images public read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product-images authenticated write" on storage.objects;
create policy "product-images authenticated write" on storage.objects
  for insert with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

drop policy if exists "product-images authenticated update" on storage.objects;
create policy "product-images authenticated update" on storage.objects
  for update using (bucket_id = 'product-images' and auth.role() = 'authenticated');

drop policy if exists "product-images authenticated delete" on storage.objects;
create policy "product-images authenticated delete" on storage.objects
  for delete using (bucket_id = 'product-images' and auth.role() = 'authenticated');

-- ============================================================
-- RPC FUNCTIONS — the only way stock is ever allowed to change.
-- All use SECURITY INVOKER (the default) so they still run as the
-- calling user and are still subject to the RLS policies above.
-- ============================================================

-- ---------- sell_item: sale with atomic oversell protection ----------
create or replace function sell_item(
  p_product_id uuid,
  p_variant_id uuid,
  p_qty integer,
  p_unit_price numeric,
  p_note text default null
) returns transactions
language plpgsql
as $$
declare
  v_stock integer;
  v_cost numeric;
  v_name text;
  v_color text;
  v_size text;
  v_label text;
  v_before integer;
  v_after integer;
  v_txn transactions;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'กรุณาระบุจำนวนให้ถูกต้อง';
  end if;
  if p_unit_price is null or p_unit_price <= 0 then
    raise exception 'กรุณาระบุราคาต่อชิ้นให้ถูกต้อง';
  end if;

  if p_variant_id is not null then
    select stock, cost, color, size into v_stock, v_cost, v_color, v_size
      from product_variants where id = p_variant_id for update;
    if not found then raise exception 'ไม่พบตัวเลือกสินค้านี้'; end if;
    select name into v_name from products where id = p_product_id;
    v_label := v_name || coalesce(' · ' || nullif(trim(both ' - ' from coalesce(v_color,'') || ' - ' || coalesce(v_size,'')), ''), '');
  else
    select stock, cost, name into v_stock, v_cost, v_name
      from products where id = p_product_id for update;
    if not found then raise exception 'ไม่พบสินค้านี้'; end if;
    v_label := v_name;
  end if;

  if v_stock < p_qty then
    raise exception 'สินค้าคงเหลือไม่เพียงพอ (เหลือ % ชิ้น)', v_stock;
  end if;

  v_before := v_stock;
  v_after := v_stock - p_qty;

  insert into transactions (type, category, amount, note, product_id, variant_id, qty, cost, status)
  values ('income', 'ขายสินค้า', p_unit_price * p_qty, p_note, p_product_id, p_variant_id, p_qty,
          case when v_cost is not null then v_cost * p_qty else null end, 'active')
  returning * into v_txn;

  if p_variant_id is not null then
    update product_variants set stock = v_after, updated_at = now() where id = p_variant_id;
  else
    update products set stock = v_after, updated_at = now() where id = p_product_id;
  end if;

  insert into stock_movements (product_id, variant_id, product_name, variant_label, type, qty, before_qty, after_qty, unit_cost, reason, related_txn_id)
  values (p_product_id, p_variant_id, v_name, v_label, 'out', -p_qty, v_before, v_after, v_cost, 'ขายสินค้า', v_txn.id);

  return v_txn;
end;
$$;

-- ---------- cancel_sale: reverse a sale, keep audit trail ----------
create or replace function cancel_sale(
  p_transaction_id uuid,
  p_reason text default null
) returns transactions
language plpgsql
as $$
declare
  v_txn transactions;
  v_stock integer;
  v_name text;
  v_color text;
  v_size text;
  v_label text;
  v_before integer;
  v_after integer;
begin
  select * into v_txn from transactions where id = p_transaction_id for update;
  if not found then raise exception 'ไม่พบรายการนี้'; end if;
  if v_txn.status = 'cancelled' then raise exception 'รายการนี้ถูกยกเลิกไปแล้ว'; end if;
  if v_txn.type <> 'income' or v_txn.product_id is null or v_txn.qty is null then
    raise exception 'รายการนี้ไม่ใช่การขายสินค้า ยกเลิกด้วยวิธีนี้ไม่ได้';
  end if;

  if v_txn.variant_id is not null then
    select stock, color, size into v_stock, v_color, v_size from product_variants where id = v_txn.variant_id for update;
    select name into v_name from products where id = v_txn.product_id;
    v_label := v_name || coalesce(' · ' || nullif(trim(both ' - ' from coalesce(v_color,'') || ' - ' || coalesce(v_size,'')), ''), '');
  else
    select stock, name into v_stock, v_name from products where id = v_txn.product_id for update;
    v_label := v_name;
  end if;

  v_before := v_stock;
  v_after := v_stock + v_txn.qty;

  if v_txn.variant_id is not null then
    update product_variants set stock = v_after, updated_at = now() where id = v_txn.variant_id;
  else
    update products set stock = v_after, updated_at = now() where id = v_txn.product_id;
  end if;

  insert into stock_movements (product_id, variant_id, product_name, variant_label, type, qty, before_qty, after_qty, unit_cost, reason, related_txn_id)
  values (v_txn.product_id, v_txn.variant_id, v_name, v_label, 'reversal', v_txn.qty, v_before, v_after,
          case when v_txn.qty > 0 then v_txn.cost / v_txn.qty else null end, 'ยกเลิกการขาย', v_txn.id);

  update transactions
    set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
    where id = p_transaction_id
    returning * into v_txn;

  return v_txn;
end;
$$;

-- ---------- stock_in: receive stock, optional linked expense ----------
create or replace function stock_in(
  p_product_id uuid,
  p_variant_id uuid,
  p_qty integer,
  p_unit_cost numeric default null,
  p_note text default null,
  p_log_expense boolean default true
) returns stock_movements
language plpgsql
as $$
declare
  v_stock integer;
  v_name text;
  v_color text;
  v_size text;
  v_label text;
  v_before integer;
  v_after integer;
  v_txn_id uuid;
  v_mv stock_movements;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'กรุณาระบุจำนวนให้ถูกต้อง';
  end if;

  if p_variant_id is not null then
    select stock, color, size into v_stock, v_color, v_size from product_variants where id = p_variant_id for update;
    if not found then raise exception 'ไม่พบตัวเลือกสินค้านี้'; end if;
    select name into v_name from products where id = p_product_id;
    v_label := v_name || coalesce(' · ' || nullif(trim(both ' - ' from coalesce(v_color,'') || ' - ' || coalesce(v_size,'')), ''), '');
  else
    select stock, name into v_stock, v_name from products where id = p_product_id for update;
    if not found then raise exception 'ไม่พบสินค้านี้'; end if;
    v_label := v_name;
  end if;

  v_before := v_stock;
  v_after := v_stock + p_qty;

  if p_variant_id is not null then
    update product_variants set stock = v_after, updated_at = now() where id = p_variant_id;
  else
    update products set stock = v_after, updated_at = now() where id = p_product_id;
  end if;

  if p_log_expense and p_unit_cost is not null and p_unit_cost > 0 then
    insert into transactions (type, category, amount, note, product_id, variant_id, qty, status)
    values ('expense', 'ซื้อสินค้า/ต้นทุน', p_unit_cost * p_qty,
            'รับเข้า ' || v_label || ' x' || p_qty || coalesce(' - ' || p_note, ''),
            p_product_id, p_variant_id, p_qty, 'active')
    returning id into v_txn_id;
  end if;

  insert into stock_movements (product_id, variant_id, product_name, variant_label, type, qty, before_qty, after_qty, unit_cost, reason, note, related_txn_id)
  values (p_product_id, p_variant_id, v_name, v_label, 'in', p_qty, v_before, v_after, p_unit_cost, 'รับสินค้าเข้า', p_note, v_txn_id)
  returning * into v_mv;

  return v_mv;
end;
$$;

-- ---------- cancel_stock_in: reverse a receipt, refuse if already partly sold ----------
create or replace function cancel_stock_in(
  p_movement_id uuid
) returns stock_movements
language plpgsql
as $$
declare
  v_mv stock_movements;
  v_stock integer;
  v_after integer;
  v_rev stock_movements;
begin
  select * into v_mv from stock_movements where id = p_movement_id for update;
  if not found then raise exception 'ไม่พบรายการรับเข้านี้'; end if;
  if v_mv.type <> 'in' then raise exception 'รายการนี้ไม่ใช่การรับสินค้าเข้า ยกเลิกด้วยวิธีนี้ไม่ได้'; end if;
  if v_mv.reversed_at is not null then raise exception 'รายการนี้ถูกยกเลิกไปแล้ว'; end if;

  if v_mv.variant_id is not null then
    select stock into v_stock from product_variants where id = v_mv.variant_id for update;
  else
    select stock into v_stock from products where id = v_mv.product_id for update;
  end if;

  v_after := v_stock - v_mv.qty;
  if v_after < 0 then
    raise exception 'ยกเลิกไม่ได้ เพราะสต๊อกถูกขายไปแล้วบางส่วน (เหลือ % ชิ้น ต้องการคืน %)', v_stock, v_mv.qty;
  end if;

  if v_mv.variant_id is not null then
    update product_variants set stock = v_after, updated_at = now() where id = v_mv.variant_id;
  else
    update products set stock = v_after, updated_at = now() where id = v_mv.product_id;
  end if;

  insert into stock_movements (product_id, variant_id, product_name, variant_label, type, qty, before_qty, after_qty, unit_cost, reason, related_txn_id)
  values (v_mv.product_id, v_mv.variant_id, v_mv.product_name, v_mv.variant_label, 'reversal', -v_mv.qty, v_stock, v_after, v_mv.unit_cost, 'ยกเลิกการรับเข้า', v_mv.related_txn_id)
  returning * into v_rev;

  update stock_movements set reversed_at = now() where id = p_movement_id;

  if v_mv.related_txn_id is not null then
    update transactions set status = 'cancelled', cancelled_at = now(), cancel_reason = 'ยกเลิกรายการรับสินค้าเข้า'
      where id = v_mv.related_txn_id and status = 'active';
  end if;

  return v_rev;
end;
$$;

-- ---------- stock_adjust: loss/damage/manual correction, never goes negative ----------
create or replace function stock_adjust(
  p_product_id uuid,
  p_variant_id uuid,
  p_qty integer,          -- positive amount to REMOVE from stock
  p_reason text,
  p_note text default null
) returns stock_movements
language plpgsql
as $$
declare
  v_stock integer;
  v_cost numeric;
  v_name text;
  v_color text;
  v_size text;
  v_label text;
  v_after integer;
  v_mv stock_movements;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'กรุณาระบุจำนวนให้ถูกต้อง';
  end if;

  if p_variant_id is not null then
    select stock, cost, color, size into v_stock, v_cost, v_color, v_size from product_variants where id = p_variant_id for update;
    if not found then raise exception 'ไม่พบตัวเลือกสินค้านี้'; end if;
    select name into v_name from products where id = p_product_id;
    v_label := v_name || coalesce(' · ' || nullif(trim(both ' - ' from coalesce(v_color,'') || ' - ' || coalesce(v_size,'')), ''), '');
  else
    select stock, cost, name into v_stock, v_cost, v_name from products where id = p_product_id for update;
    if not found then raise exception 'ไม่พบสินค้านี้'; end if;
    v_label := v_name;
  end if;

  if v_stock < p_qty then
    raise exception 'ปรับยอดไม่ได้ สินค้ามีอยู่ % ชิ้น แต่พยายามลด %  ชิ้น', v_stock, p_qty;
  end if;

  v_after := v_stock - p_qty;

  if p_variant_id is not null then
    update product_variants set stock = v_after, updated_at = now() where id = p_variant_id;
  else
    update products set stock = v_after, updated_at = now() where id = p_product_id;
  end if;

  insert into stock_movements (product_id, variant_id, product_name, variant_label, type, qty, before_qty, after_qty, unit_cost, reason, note)
  values (p_product_id, p_variant_id, v_name, v_label, 'adjust', -p_qty, v_stock, v_after, v_cost, p_reason, p_note)
  returning * into v_mv;

  return v_mv;
end;
$$;

-- ---------- dashboard_summary: totals computed in the database ----------
-- Supabase returns at most 1,000 rows per query, so summing transactions in
-- the browser/server would silently under-count once the shop has more than
-- 1,000 records. Aggregating in SQL has no such limit.
-- "Cash balance" = all active income − all active expense (cancelled excluded).
-- "Gross profit" only counts sales whose cost is known; sales with unknown
-- cost are reported separately and never treated as profit.
create or replace function dashboard_summary(p_month text)
returns json
language sql
stable
as $$
  select json_build_object(
    'all_in',        coalesce(sum(amount) filter (where type = 'income'), 0),
    'all_out',       coalesce(sum(amount) filter (where type = 'expense'), 0),
    'month_in',      coalesce(sum(amount) filter (where type = 'income'  and to_char(date, 'YYYY-MM') = p_month), 0),
    'month_out',     coalesce(sum(amount) filter (where type = 'expense' and to_char(date, 'YYYY-MM') = p_month), 0),
    'month_gross',   coalesce(sum(amount - cost) filter (where type = 'income' and cost is not null and to_char(date, 'YYYY-MM') = p_month), 0),
    'month_unknown', coalesce(sum(amount) filter (where type = 'income' and cost is null and product_id is not null and to_char(date, 'YYYY-MM') = p_month), 0)
  )
  from transactions
  where status = 'active';
$$;
