-- ============================================================================
-- Migration: 20261113_driver_dispatch_additive.sql
-- Purpose: Additive storage bucket & RLS policies for driver verification
--          documents and proof-of-delivery photos (shared with Firebase backend).
-- Reversible: Yes (see DOWN section at bottom).
-- ============================================================================

-- UP MIGRATION (ADDITIVE ONLY)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-assets',
  'driver-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read driver proof of delivery" on storage.objects;
create policy "Public read driver proof of delivery"
  on storage.objects for select
  to public
  using (bucket_id = 'driver-assets');

drop policy if exists "Allow driver asset uploads" on storage.objects;
create policy "Allow driver asset uploads"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'driver-assets');

-- ============================================================================
-- DOWN MIGRATION (REVERSIBLE)
-- drop policy if exists "Allow driver asset uploads" on storage.objects;
-- drop policy if exists "Public read driver proof of delivery" on storage.objects;
-- delete from storage.buckets where id = 'driver-assets';
-- ============================================================================
