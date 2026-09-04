-- Gully Phase 2 — the reports table.
--
-- Optional. The app is local-first: every report is written to IndexedDB on the
-- phone and works with no server at all. Run this only when you want reports to
-- leave the device, then set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
--
-- Mirrors PRD §6, with four Phase 2 additions marked below.

create extension if not exists postgis;

create table if not exists reports (
  id                uuid primary key,
  segment_id        text        not null,   -- 'w123456:2'; no FK, so the client can
                                            -- snap and report without a seeded graph
  created_at        timestamptz not null default now(),
  obstruction_type  text,                   -- tanker|mixer|garbage|construction|event|lorry|other
  source            text        not null,   -- photo|voice|passive|official|tap
  classifier_conf   real,
  reporter_id       uuid        not null,
  lat               double precision not null,
  lng               double precision not null,
  snap_distance_m   real,
  heading_deg       real,
  photo_key         text,                   -- set only after a redacted upload

  -- Phase 2 additions, absent from PRD §6:
  kind              text not null default 'obstruction',  -- obstruction|clear
  capture_ms        integer,                              -- exit-criterion timing
  corrected         boolean not null default false,       -- reporter overrode top-1
  geom              geometry(Point, 4326)
    generated always as (st_setsrid(st_makepoint(lng, lat), 4326)) stored,

  constraint reports_kind_ck check (kind in ('obstruction', 'clear')),
  constraint reports_source_ck
    check (source in ('photo', 'voice', 'passive', 'official', 'tap')),
  constraint reports_type_ck check (
    obstruction_type is null or obstruction_type in
      ('tanker', 'mixer', 'garbage', 'construction', 'event', 'lorry', 'other')
  ),
  -- A clear report names no obstruction; an obstruction report must name one.
  constraint reports_kind_type_ck check (
    (kind = 'clear' and obstruction_type is null)
    or (kind = 'obstruction' and obstruction_type is not null)
  )
);

create index if not exists reports_segment_time_idx on reports (segment_id, created_at desc);
create index if not exists reports_geom_idx on reports using gist (geom);
create index if not exists reports_reporter_idx on reports (reporter_id, created_at desc);

-- Anonymous insert, no read. Reporters have no account (PRD §7 Phase 2: capture
-- in four seconds — a sign-in step ends that), and the anon key is public, so
-- letting it read back every report would publish everyone's movements.
alter table reports enable row level security;

drop policy if exists reports_anon_insert on reports;
create policy reports_anon_insert on reports for insert to anon with check (true);

-- ── optional: the segment graph, for server-side snapping in a later phase ───
-- Phase 2 snaps on the device. Seed this only when you need ST_LineLocatePoint
-- on the server:
--   \copy is awkward for GeoJSON; use the loader described in MANUAL.md.
--
-- create table segments (
--   id text primary key, osm_way_id bigint, name text,
--   geom geometry(LineString, 4326), length_m real,
--   width_m real, width_source text, width_conf real,
--   lanes smallint, oneway boolean, from_node bigint, to_node bigint
-- );
-- create index segments_geom_idx on segments using gist (geom);
