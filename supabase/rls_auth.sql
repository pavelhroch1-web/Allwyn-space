-- ══════════════════════════════════════════════════════════════════════════
-- FÁZE 2 — AUTH-BASED RLS (nahrazuje pilot anon politiky v schema.sql)
--
-- Spustit v Supabase SQL editoru PO:
-- 1. Vytvoření auth.users účtů (Authentication → Users v dashboardu)
-- 2. Vložení profilů do public.profiles (viz schema.sql komentáře)
-- 3. Ověření, že přihlášení funguje (login formulář na landing stránce)
--
-- Tento skript NAHRAZUJE všechna "pilot test — anon full access" pravidla
-- na datových tabulkách. profiles tabulka má auth RLS již ze schema.sql.
-- ══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- HELPER FUNKCE (security definer = spouštějí se jako
-- vlastník funkce, ne jako volající uživatel — nutné
-- pro přístup do profiles z RLS policy)
-- ─────────────────────────────────────────────────────

create or replace function public.auth_user_role()
returns text
language sql stable security definer
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.auth_user_name()
returns text
language sql stable security definer
as $$
  select name from public.profiles where id = auth.uid()
$$;


-- ─────────────────────────────────────────────────────
-- sync_kv
-- technik: čte/píše jen svoje řádky + _global (readonly)
-- velín: čte i píše vše (edituje globální config)
-- ─────────────────────────────────────────────────────

drop policy if exists "pilot test — anon full access" on public.sync_kv;

create policy "auth_sync_kv_select"
  on public.sync_kv for select to authenticated
  using (
    public.auth_user_role() = 'velin'
    or technician = '_global'
    or technician = public.auth_user_name()
  );

create policy "auth_sync_kv_insert"
  on public.sync_kv for insert to authenticated
  with check (
    public.auth_user_role() = 'velin'
    or technician = public.auth_user_name()
  );

create policy "auth_sync_kv_update"
  on public.sync_kv for update to authenticated
  using (
    public.auth_user_role() = 'velin'
    or technician = public.auth_user_name()
  )
  with check (
    public.auth_user_role() = 'velin'
    or technician = public.auth_user_name()
  );

create policy "auth_sync_kv_delete"
  on public.sync_kv for delete to authenticated
  using (
    public.auth_user_role() = 'velin'
    or technician = public.auth_user_name()
  );


-- ─────────────────────────────────────────────────────
-- technicians (referenční tabulka z Tourplan)
-- čtení: všichni přihlášení
-- zápis: jen velín (technici se nepíší sami)
-- ─────────────────────────────────────────────────────

drop policy if exists "pilot test — anon full access" on public.technicians;

create policy "auth_technicians_select"
  on public.technicians for select to authenticated
  using (true);

create policy "auth_technicians_write"
  on public.technicians for all to authenticated
  using (public.auth_user_role() = 'velin')
  with check (public.auth_user_role() = 'velin');


-- ─────────────────────────────────────────────────────
-- pos_locations (referenční tabulka POS)
-- čtení: všichni přihlášení (technik vidí POS na trase)
-- zápis: jen velín
-- ─────────────────────────────────────────────────────

drop policy if exists "pilot test — anon full access" on public.pos_locations;

create policy "auth_pos_locations_select"
  on public.pos_locations for select to authenticated
  using (true);

create policy "auth_pos_locations_write"
  on public.pos_locations for all to authenticated
  using (public.auth_user_role() = 'velin')
  with check (public.auth_user_role() = 'velin');


-- ─────────────────────────────────────────────────────
-- visits
-- technik: jen svoje návštěvy (technician_id = jméno z profilu)
-- velín: čte i píše vše
-- ─────────────────────────────────────────────────────

drop policy if exists "pilot test — anon full access" on public.visits;

create policy "auth_visits"
  on public.visits for all to authenticated
  using (
    public.auth_user_role() = 'velin'
    or technician_id = public.auth_user_name()
  )
  with check (
    public.auth_user_role() = 'velin'
    or technician_id = public.auth_user_name()
  );


-- ─────────────────────────────────────────────────────
-- visit_tasks (přes visits.technician_id)
-- ─────────────────────────────────────────────────────

drop policy if exists "pilot test — anon full access" on public.visit_tasks;

create policy "auth_visit_tasks"
  on public.visit_tasks for all to authenticated
  using (
    public.auth_user_role() = 'velin'
    or exists (
      select 1 from public.visits v
      where v.id = visit_tasks.visit_id
        and v.technician_id = public.auth_user_name()
    )
  )
  with check (
    public.auth_user_role() = 'velin'
    or exists (
      select 1 from public.visits v
      where v.id = visit_tasks.visit_id
        and v.technician_id = public.auth_user_name()
    )
  );


-- ─────────────────────────────────────────────────────
-- materials (pos_id, nemá technician_id — design gap,
-- zatím allow all authenticated; POS jsou de facto
-- přiřazené jednomu technikovi, kolize jsou nepravděpodobné)
-- ─────────────────────────────────────────────────────

drop policy if exists "pilot test — anon full access" on public.materials;

create policy "auth_materials"
  on public.materials for all to authenticated
  using (true)
  with check (true);


-- ─────────────────────────────────────────────────────
-- sync_events (audit log)
-- technik: jen svoje záznamy ("user" = jméno z profilu)
-- velín: čte vše (audit), smí i zapisovat
-- ─────────────────────────────────────────────────────

drop policy if exists "pilot test — anon full access" on public.sync_events;

create policy "auth_sync_events"
  on public.sync_events for all to authenticated
  using (
    public.auth_user_role() = 'velin'
    or "user" = public.auth_user_name()
  )
  with check (
    public.auth_user_role() = 'velin'
    or "user" = public.auth_user_name()
  );


-- ─────────────────────────────────────────────────────
-- Storage: visit-photos
-- čtení: zachovat veřejné (URL je prakticky secret — bez
--   znalosti UUID filename nikdo nic nenajde, a technik
--   potřebuje zobrazit fotku z img src bez auth headeru)
-- zápis: jen přihlášení uživatelé
-- ─────────────────────────────────────────────────────

drop policy if exists "pilot test — anon write visit-photos" on storage.objects;

create policy "auth_visit_photos_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-photos');

-- Veřejné čtení ponecháme — změna by rozbila img src URL v appce
-- (browser neposílá auth header na <img src="...">)
-- Upgrade: signed URLs před produkčním nasazením.
