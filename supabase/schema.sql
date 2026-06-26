-- Allwyn Space — cross-device sync shim (Fáze: pilot, scope: 5 pilotních techniků, viz PosModel.PILOT_TECHNICIANS)
--
-- Tohle NENÍ nový datový model. Je to 1:1 zrcadlení existujících localStorage
-- klíčů (viz docs/CLAUDE.md "Klíče v localStorage") do Supabase, aby Velín a
-- technik viděli stejná data z různých zařízení. Až přijde reálná migrace na
-- backend (docs/MIGRATION_PLAN.md), tahle tabulka se zahodí a nahradí
-- normalizovaným schématem — do té doby je to nejmenší krok, který řeší
-- nejkritičtější mezeru pro pilot (žádná sdílená data mezi zařízeními).
--
-- technician = '_global' pro klíče, které nejsou vázané na konkrétního
-- technika (editor_*, admin_tasks, inv_catalog — edituje je Velín a musí být
-- vidět na všech zařízeních technika i Velína).

create table if not exists public.sync_kv (
  technician text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (technician, key)
);

alter table public.sync_kv enable row level security;

-- Pilotní fáze: anon klíč může číst i psát. Přijatelné riziko pro 5 lidí na
-- kontrolovaných zařízeních v rámci pilotu — NEPOUŽÍVAT takto nad rámec
-- tohoto pilotu. Před širším nasazením nahradit auth-based politikou
-- (technik smí psát jen svůj řádek, Velín čte vše).
create policy "pilot test — anon full access"
  on public.sync_kv
  for all
  using (true)
  with check (true);

-- Realtime: ať Velín vidí změny technika bez nutnosti manuálního refreshu.
alter publication supabase_realtime add table public.sync_kv;

-- ══════════════════════════════════════════════════════════════════════════
-- FÁZE 3 (MIGRATION_PLAN.md) — reálný relační model návštěv.
-- Tohle NAHRAZUJE sync_kv pro vše spojené s návštěvou POS (stav, checklist,
-- materiál, poznámky, podpis, metadata fotek). sync_kv výše zůstává jen pro
-- to, co tu ještě nemá pokrytí (admin globální config — editor_*, inv_catalog,
-- admin_tasks) a pro GPS/approval, dokud nebudou taky migrované.
--
-- ID technika = jeho reálné jméno z Tourplan (stejná konvence jako sync_kv
-- technician sloupec) — žádné vymyšlené UUID, technici dnes nemají žádný
-- jiný stabilní identifikátor. ID POS = reálné Tourplan/POS Master POS ID.
-- ══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create table if not exists public.technicians (
  id text primary key,
  name text not null,
  region text
);

create table if not exists public.pos_locations (
  id text primary key,
  name text,
  address text,
  region text
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  technician_id text not null references public.technicians(id),
  pos_id text not null references public.pos_locations(id),
  status text not null default 'in_progress',  -- in_progress | completed
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  -- Nad rámec Pavlova zadání, ale nutné pro flow "checklist/kampaň/podpis/foto
  -- metadata" — žádná z navržených tabulek pro ně nemá místo:
  signature_data text,    -- canvas podpis (base64), stejný formát jako dnešní supply_* sigData
  photos_meta jsonb,       -- [{slot, sizeBytes, takenAt}, ...] — jen metadata, ne obsah fotky
  updated_at timestamptz not null default now()
);

create table if not exists public.visit_tasks (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  task_name text not null,
  status text not null default 'pending',  -- pending | done
  updated_at timestamptz not null default now(),
  unique (visit_id, task_name)
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  pos_id text not null references public.pos_locations(id),
  item text not null,
  quantity numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (pos_id, item)
);

create table if not exists public.sync_events (
  id uuid primary key default gen_random_uuid(),
  "user" text not null,
  action text not null,
  timestamp timestamptz not null default now()
);

alter table public.technicians enable row level security;
alter table public.pos_locations enable row level security;
alter table public.visits enable row level security;
alter table public.visit_tasks enable row level security;
alter table public.materials enable row level security;
alter table public.sync_events enable row level security;

-- Pilotní fáze: stejná politika jako sync_kv výše — anon plný přístup,
-- vědomé riziko pro 5 lidí na kontrolovaných zařízeních. Nahradit auth-based
-- politikou (technik píše jen svůj řádek, Velín čte/píše vše) před širším
-- nasazením — viz docs/PILOT_READINESS.md.
create policy "pilot test — anon full access" on public.technicians for all using (true) with check (true);
create policy "pilot test — anon full access" on public.pos_locations for all using (true) with check (true);
create policy "pilot test — anon full access" on public.visits for all using (true) with check (true);
create policy "pilot test — anon full access" on public.visit_tasks for all using (true) with check (true);
create policy "pilot test — anon full access" on public.materials for all using (true) with check (true);
create policy "pilot test — anon full access" on public.sync_events for all using (true) with check (true);

-- Realtime: Velín vidí dokončení návštěvy/checklistu bez manuálního refreshu.
alter publication supabase_realtime add table public.visits;
alter publication supabase_realtime add table public.visit_tasks;
alter publication supabase_realtime add table public.materials;

-- ══════════════════════════════════════════════════════════════════════════
-- KROK 2 (perzistence fotek) — skutečný obsah fotky (JPEG bajty) jde do
-- Supabase Storage, ne do JSON sloupce. visits.photos_meta výše teď nese i
-- "url" pro každý slot, na kterou tohle ukazuje. Bucket je veřejně čitelný
-- (stejné pilotní riziko jako anon RLS výše — 5 lidí na kontrolovaných
-- zařízeních) — nahradit signed URLs / auth před širším nasazením.
-- ══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', true)
on conflict (id) do nothing;

create policy "pilot test — anon read visit-photos"
  on storage.objects for select
  using (bucket_id = 'visit-photos');

create policy "pilot test — anon write visit-photos"
  on storage.objects for insert
  with check (bucket_id = 'visit-photos');
