-- ══════════════════════════════════════════════════════════════════
-- MIGRACE 001 — přidat technician_id do materials
--
-- Spustit v Supabase SQL editoru na existující databázi.
-- Na nové databázi stačí schema.sql (sloupec je už tam).
--
-- Proč: materials tabulka nemá vazbu na technika — Velín nemůže vidět
-- kdo co kde doručil. Tento sloupec to opravuje.
-- ══════════════════════════════════════════════════════════════════

alter table public.materials
  add column if not exists technician_id text references public.technicians(id);
