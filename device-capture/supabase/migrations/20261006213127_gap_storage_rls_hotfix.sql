-- v1.4.1: explicitly validate the Storage OBJECT path, avoiding project-name shadowing.
-- The standard-conforming SQL string contains one backslash for the literal .jpg.
create or replace function public.cablemint_gap_storage_write(object_name text)
 returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce(array_length(storage.foldername(object_name),1),0)<>4
 or (storage.foldername(object_name))[1]<>(select auth.uid())::text
 or (storage.foldername(object_name))[3]<>'gaps'
 or storage.filename(object_name) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then return false; end if;
 perform 1 from public.field_gaps g join public.field_projects p on p.id=g.project_id
 where g.id::text=(storage.foldername(object_name))[4]
 and g.project_id::text=(storage.foldername(object_name))[2]
 and g.user_id=(select auth.uid()) and p.user_id=(select auth.uid())
 and g.deletion_requested_at is null
 and not exists(select 1 from public.field_gap_deletions d where d.gap_id=g.id and d.project_id=g.project_id and d.user_id=g.user_id)
 for share of g;
 return found;
end $$;
revoke all on function public.cablemint_gap_storage_write(text) from public;
grant execute on function public.cablemint_gap_storage_write(text) to authenticated;

alter policy project_files_storage_insert on storage.objects to authenticated
 with check (objects.bucket_id='project-files' and public.cablemint_gap_storage_write(objects.name));
alter policy project_files_storage_select on storage.objects to authenticated using (
 objects.bucket_id='project-files'
 and (storage.foldername(objects.name))[1]=(select auth.uid())::text
 and array_length(storage.foldername(objects.name),1)=4
 and (storage.foldername(objects.name))[3]='gaps'
 and storage.filename(objects.name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
 and exists (
  select 1 from public.field_gaps g join public.field_projects p on p.id=g.project_id
  where g.id::text=(storage.foldername(objects.name))[4]
  and g.project_id::text=(storage.foldername(objects.name))[2]
  and g.user_id=(select auth.uid()) and p.user_id=(select auth.uid())
 ));
-- Reads/deletes remain available during staged cleanup. Writes reject deleting/marked Gaps.
alter policy project_files_storage_delete on storage.objects to authenticated using (
 objects.bucket_id='project-files'
 and (storage.foldername(objects.name))[1]=(select auth.uid())::text
 and array_length(storage.foldername(objects.name),1)=4
 and (storage.foldername(objects.name))[3]='gaps'
 and storage.filename(objects.name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
 and exists (
  select 1 from public.field_gaps g join public.field_projects p on p.id=g.project_id
  where g.id::text=(storage.foldername(objects.name))[4]
  and g.project_id::text=(storage.foldername(objects.name))[2]
  and g.user_id=(select auth.uid()) and p.user_id=(select auth.uid())
 ));
alter policy project_files_storage_update on storage.objects to authenticated
 using (
 objects.bucket_id='project-files'
 and (storage.foldername(objects.name))[1]=(select auth.uid())::text
 and array_length(storage.foldername(objects.name),1)=4
 and (storage.foldername(objects.name))[3]='gaps'
 and storage.filename(objects.name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
 and exists (
  select 1 from public.field_gaps g join public.field_projects p on p.id=g.project_id
  where g.id::text=(storage.foldername(objects.name))[4]
  and g.project_id::text=(storage.foldername(objects.name))[2]
  and g.user_id=(select auth.uid()) and p.user_id=(select auth.uid())
 ) and public.cablemint_gap_storage_write(objects.name))
 with check (objects.bucket_id='project-files' and public.cablemint_gap_storage_write(objects.name));
