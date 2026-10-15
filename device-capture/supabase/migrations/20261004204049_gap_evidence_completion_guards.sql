-- Declare intended evidence count so another phone does not mistake partial uploads for Synced.
alter table public.field_gaps add column photo_count smallint not null default 1 check (photo_count between 1 and 3);
create or replace function public.cablemint_gap_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id<>old.id or new.user_id<>old.user_id or new.project_id<>old.project_id or new.created_at<>old.created_at or new.photo_count<>old.photo_count then raise exception 'Gap ownership, identity and evidence count cannot be changed'; end if;
 if old.deletion_requested_at is not null and new.deletion_requested_at is null then raise exception 'Gap deletion is already in progress'; end if;
 new.updated_at=clock_timestamp();return new;
end $$;
create or replace function public.cablemint_file_identity() returns trigger language plpgsql security invoker set search_path='' as $$
declare expected smallint;
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.user_id<>old.user_id or new.project_id<>old.project_id or new.entity_type<>old.entity_type or new.entity_id<>old.entity_id or new.storage_path<>old.storage_path or new.created_at<>old.created_at) then raise exception 'File ownership, path and identity cannot be changed'; end if;
 if new.entity_type<>'gap' then raise exception 'Only Gap evidence is supported in this release'; end if;
 select g.photo_count into expected from public.field_gaps g where g.id=new.entity_id and g.user_id=new.user_id and g.project_id=new.project_id and g.deletion_requested_at is null for update;
 if not found then raise exception 'Gap is missing or deletion is in progress'; end if;
 if (select count(*) from public.project_files f where f.entity_type='gap' and f.entity_id=new.entity_id and f.id<>new.id)>=expected then raise exception 'Gap evidence count exceeded'; end if;
 return new;
end $$;
-- Lock the parent during Storage writes. A deletion tombstone serializes against these writes.
create function public.cablemint_gap_storage_write(object_name text) returns boolean
 language plpgsql security invoker set search_path='' as $$
begin
 if array_length(storage.foldername(object_name),1)<>4 or (storage.foldername(object_name))[1]<>(select auth.uid())::text or (storage.foldername(object_name))[3]<>'gaps' or storage.filename(object_name) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then return false; end if;
 perform 1 from public.field_gaps g join public.field_projects p on p.id=g.project_id
 where g.id::text=(storage.foldername(object_name))[4] and g.project_id::text=(storage.foldername(object_name))[2]
 and g.user_id=(select auth.uid()) and p.user_id=(select auth.uid()) and g.deletion_requested_at is null for share of g;
 return found;
end $$;
revoke all on function public.cablemint_gap_storage_write(text) from public;
grant execute on function public.cablemint_gap_storage_write(text) to authenticated;
alter policy project_files_storage_insert on storage.objects with check (bucket_id='project-files' and public.cablemint_gap_storage_write(name));
alter policy project_files_storage_update on storage.objects with check (bucket_id='project-files' and public.cablemint_gap_storage_write(name));
alter policy gap_owner_delete on public.field_gaps using (user_id=(select auth.uid()) and deletion_requested_at is not null
 and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid()))
 and not exists(select 1 from public.project_files f where f.entity_type='gap' and f.entity_id=field_gaps.id)
 and not exists(select 1 from storage.objects o where o.bucket_id='project-files' and o.name like field_gaps.user_id::text||'/'||field_gaps.project_id::text||'/gaps/'||field_gaps.id::text||'/%'));
