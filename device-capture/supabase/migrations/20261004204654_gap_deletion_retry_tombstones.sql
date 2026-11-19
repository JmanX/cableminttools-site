create table public.field_gap_deletions (
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.field_projects(id) on delete cascade,
 gap_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(user_id,project_id,gap_id)
);
create index field_gap_deletions_project_fk on public.field_gap_deletions(project_id);
create index field_gap_deletions_owner_time on public.field_gap_deletions(user_id,created_at,gap_id);
alter table public.field_gap_deletions enable row level security;
revoke all on public.field_gap_deletions from public,anon,authenticated;
grant select,insert on public.field_gap_deletions to authenticated;
create policy gap_deletion_owner_select on public.field_gap_deletions for select to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy gap_deletion_owner_insert on public.field_gap_deletions for insert to authenticated
 with check(user_id=(select auth.uid()) and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid())));
alter policy gap_owner_insert on public.field_gaps with check(user_id=(select auth.uid())
 and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid()))
 and not exists(select 1 from public.field_gap_deletions d where d.gap_id=field_gaps.id and d.project_id=field_gaps.project_id and d.user_id=field_gaps.user_id));
alter policy gap_owner_update on public.field_gaps with check(user_id=(select auth.uid())
 and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid()))
 and (deletion_requested_at is not null or not exists(select 1 from public.field_gap_deletions d where d.gap_id=field_gaps.id and d.project_id=field_gaps.project_id and d.user_id=field_gaps.user_id)));
alter policy gap_owner_delete on public.field_gaps using(user_id=(select auth.uid()) and deletion_requested_at is not null
 and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid()))
 and exists(select 1 from public.field_gap_deletions d where d.gap_id=field_gaps.id and d.project_id=field_gaps.project_id and d.user_id=field_gaps.user_id)
 and not exists(select 1 from public.project_files f where f.entity_type='gap' and f.entity_id=field_gaps.id)
 and not exists(select 1 from storage.objects o where o.bucket_id='project-files' and o.name like field_gaps.user_id::text||'/'||field_gaps.project_id::text||'/gaps/'||field_gaps.id::text||'/%'));
create or replace function public.cablemint_gap_storage_write(object_name text) returns boolean
 language plpgsql security invoker set search_path='' as $$
begin
 if array_length(storage.foldername(object_name),1)<>4 or (storage.foldername(object_name))[1]<>(select auth.uid())::text or (storage.foldername(object_name))[3]<>'gaps' or storage.filename(object_name) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then return false; end if;
 perform 1 from public.field_gaps g join public.field_projects p on p.id=g.project_id
 where g.id::text=(storage.foldername(object_name))[4] and g.project_id::text=(storage.foldername(object_name))[2]
 and g.user_id=(select auth.uid()) and p.user_id=(select auth.uid()) and g.deletion_requested_at is null
 and not exists(select 1 from public.field_gap_deletions d where d.gap_id=g.id and d.project_id=g.project_id and d.user_id=g.user_id) for share of g;
 return found;
end $$;
create or replace function public.cablemint_file_identity() returns trigger language plpgsql security invoker set search_path='' as $$
declare expected smallint;
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.user_id<>old.user_id or new.project_id<>old.project_id or new.entity_type<>old.entity_type or new.entity_id<>old.entity_id or new.storage_path<>old.storage_path or new.created_at<>old.created_at) then raise exception 'File ownership, path and identity cannot be changed'; end if;
 if new.entity_type<>'gap' then raise exception 'Only Gap evidence is supported in this release'; end if;
 if exists(select 1 from public.field_gap_deletions d where d.user_id=new.user_id and d.project_id=new.project_id and d.gap_id=new.entity_id) then raise exception 'Gap deletion is already recorded'; end if;
 select g.photo_count into expected from public.field_gaps g where g.id=new.entity_id and g.user_id=new.user_id and g.project_id=new.project_id and g.deletion_requested_at is null for update;
 if not found then raise exception 'Gap is missing or deletion is in progress'; end if;
 if (select count(*) from public.project_files f where f.entity_type='gap' and f.entity_id=new.entity_id and f.id<>new.id)>=expected then raise exception 'Gap evidence count exceeded'; end if;
 return new;
end $$;
