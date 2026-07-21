insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-documents',
  'profile-documents',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their own profile documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can upload their own profile documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can delete their own profile documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
