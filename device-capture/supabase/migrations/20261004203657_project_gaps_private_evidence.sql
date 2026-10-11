-- CableMint v1.4.0. Additive only: no changes to existing devices, billing or functions.
create table public.field_gaps (
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 project_id uuid not null references public.field_projects(id),
 building text not null default '' check (length(building)<=120),
 floor_area text not null default '' check (length(floor_area)<=120),
 unit_location text not null default '' check (length(unit_location)<=160),
 category text not null check (category in ('Missing device','Cable not installed','Damaged equipment','Bad / missing label','No power','Inaccessible location','Blocked pathway','Incomplete work','Other site issue')),
 description text not null check (length(btrim(description)) between 1 and 2000),
 status text not null default 'open' check (status in ('open','resolved')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 resolved_at timestamptz,
 -- Tombstone blocks new uploads while Storage cleanup is retried.
 deletion_requested_at timestamptz,
 check ((status='open' and resolved_at is null) or (status='resolved' and resolved_at is not null))
);
create index field_gaps_owner_project_status on public.field_gaps(user_id,project_id,status,created_at desc,id);
create index field_gaps_project_fk on public.field_gaps(project_id);
create table public.project_files (
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 project_id uuid not null references public.field_projects(id),
 entity_type text not null check (entity_type in ('gap','device','drawing','report')),
 entity_id uuid not null,
 storage_path text not null unique,
 file_name text not null check (length(file_name) between 1 and 160),
 mime_type text not null check (mime_type='image/jpeg'),
 file_size bigint not null check (file_size between 1 and 10485760),
 created_at timestamptz not null default now(),
 check (storage_path=user_id::text||'/'||project_id::text||'/'||entity_type||'s/'||entity_id::text||'/'||id::text||'.jpg')
);
create index project_files_owner_project_entity on public.project_files(user_id,project_id,entity_type,entity_id);
create index project_files_project_fk on public.project_files(project_id);

alter table public.field_gaps enable row level security;
alter table public.project_files enable row level security;
revoke all on public.field_gaps, public.project_files from anon, public;
grant select,insert,update,delete on public.field_gaps, public.project_files to authenticated;
create policy gap_owner_select on public.field_gaps for select to authenticated
 using (user_id=(select auth.uid()) and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy gap_owner_insert on public.field_gaps for insert to authenticated
 with check (user_id=(select auth.uid()) and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy gap_owner_update on public.field_gaps for update to authenticated
 using (user_id=(select auth.uid()) and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid())))
 with check (user_id=(select auth.uid()) and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy gap_owner_delete on public.field_gaps for delete to authenticated
 using (user_id=(select auth.uid())
 and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid()))
 and not exists(select 1 from public.project_files f where f.entity_type='gap' and f.entity_id=field_gaps.id)
 and not exists(select 1 from storage.objects o where o.bucket_id='project-files' and o.name like field_gaps.user_id::text||'/'||field_gaps.project_id::text||'/gaps/'||field_gaps.id::text||'/%'));
create policy file_owner_select on public.project_files for select to authenticated
 using (user_id=(select auth.uid()) and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy file_owner_insert on public.project_files for insert to authenticated
 with check (user_id=(select auth.uid()) and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy file_owner_update on public.project_files for update to authenticated
 using (user_id=(select auth.uid()) and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid())))
 with check (user_id=(select auth.uid()) and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy file_owner_delete on public.project_files for delete to authenticated
 using (user_id=(select auth.uid()) and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid())));

create function public.cablemint_gap_identity() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.id<>old.id or new.user_id<>old.user_id or new.project_id<>old.project_id or new.created_at<>old.created_at then
  raise exception 'Gap ownership and identity cannot be changed';
 end if;
 if old.deletion_requested_at is not null and new.deletion_requested_at is null then
  raise exception 'Gap deletion is already in progress';
 end if;
 new.updated_at=clock_timestamp();
 return new;
end $$;
create trigger gap_identity_before_update before update on public.field_gaps for each row execute function public.cablemint_gap_identity();

create function public.cablemint_file_identity() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.user_id<>old.user_id or new.project_id<>old.project_id or new.entity_type<>old.entity_type or new.entity_id<>old.entity_id or new.storage_path<>old.storage_path or new.created_at<>old.created_at) then
  raise exception 'File ownership, path and identity cannot be changed';
 end if;
 -- Generic metadata is ready for other entity types; v1.4 authorizes Gap writes only.
 if new.entity_type<>'gap' then raise exception 'Only Gap evidence is supported in this release'; end if;
 perform 1 from public.field_gaps g where g.id=new.entity_id and g.user_id=new.user_id and g.project_id=new.project_id and g.deletion_requested_at is null for update;
 if not found then raise exception 'Gap is missing or deletion is in progress'; end if;
 if (select count(*) from public.project_files f where f.entity_type='gap' and f.entity_id=new.entity_id and f.id<>new.id)>=3 then
  raise exception 'A Gap supports at most three photos';
 end if;
 return new;
end $$;
create trigger file_identity_before_write before insert or update on public.project_files for each row execute function public.cablemint_file_identity();
revoke all on function public.cablemint_gap_identity(), public.cablemint_file_identity() from public;
grant execute on function public.cablemint_gap_identity(), public.cablemint_file_identity() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('project-files','project-files',false,10485760,array['image/jpeg']);
-- Exact hierarchy; no public policy or URL. UUIDs are compared as text (no unsafe casts).
create policy project_files_storage_select on storage.objects for select to authenticated
 using (bucket_id='project-files' and (storage.foldername(name))[1]=(select auth.uid())::text
 and array_length(storage.foldername(name),1)=4 and (storage.foldername(name))[3]='gaps'
 and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
 and exists(select 1 from public.field_gaps g join public.field_projects p on p.id=g.project_id
 where g.id::text=(storage.foldername(name))[4] and g.project_id::text=(storage.foldername(name))[2]
 and g.user_id=(select auth.uid()) and p.user_id=(select auth.uid())));
create policy project_files_storage_insert on storage.objects for insert to authenticated
 with check (bucket_id='project-files' and (storage.foldername(name))[1]=(select auth.uid())::text
 and array_length(storage.foldername(name),1)=4 and (storage.foldername(name))[3]='gaps'
 and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
 and exists(select 1 from public.field_gaps g join public.field_projects p on p.id=g.project_id
 where g.id::text=(storage.foldername(name))[4] and g.project_id::text=(storage.foldername(name))[2]
 and g.user_id=(select auth.uid()) and p.user_id=(select auth.uid()) and g.deletion_requested_at is null));
create policy project_files_storage_update on storage.objects for update to authenticated
 using (bucket_id='project-files' and (storage.foldername(name))[1]=(select auth.uid())::text
 and array_length(storage.foldername(name),1)=4 and (storage.foldername(name))[3]='gaps'
 and exists(select 1 from public.field_gaps g join public.field_projects p on p.id=g.project_id
 where g.id::text=(storage.foldername(name))[4] and g.project_id::text=(storage.foldername(name))[2]
 and g.user_id=(select auth.uid()) and p.user_id=(select auth.uid()) and g.deletion_requested_at is null))
 with check (bucket_id='project-files' and (storage.foldername(name))[1]=(select auth.uid())::text
 and array_length(storage.foldername(name),1)=4 and (storage.foldername(name))[3]='gaps'
 and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
 and exists(select 1 from public.field_gaps g join public.field_projects p on p.id=g.project_id
 where g.id::text=(storage.foldername(name))[4] and g.project_id::text=(storage.foldername(name))[2]
 and g.user_id=(select auth.uid()) and p.user_id=(select auth.uid()) and g.deletion_requested_at is null));
create policy project_files_storage_delete on storage.objects for delete to authenticated
 using (bucket_id='project-files' and (storage.foldername(name))[1]=(select auth.uid())::text
 and array_length(storage.foldername(name),1)=4 and (storage.foldername(name))[3]='gaps'
 and exists(select 1 from public.field_gaps g join public.field_projects p on p.id=g.project_id
 where g.id::text=(storage.foldername(name))[4] and g.project_id::text=(storage.foldername(name))[2]
 and g.user_id=(select auth.uid()) and p.user_id=(select auth.uid())));
