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
