-- Run once in Supabase → SQL Editor.
-- The app uploads with the anon key (Firebase auth, not Supabase auth),
-- so this bucket is public-read and allows anon inserts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Uploads use INSERT ... RETURNING, so anon needs INSERT and SELECT.
drop policy if exists "Public read product images" on storage.objects;
drop policy if exists "Anon read product images" on storage.objects;
create policy "Anon read product images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "Anon upload product images" on storage.objects;
create policy "Anon upload product images"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'product-images');

drop policy if exists "Anon update product images" on storage.objects;
create policy "Anon update product images"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');
