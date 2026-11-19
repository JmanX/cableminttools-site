-- Runtime SELECT under caller RLS avoids a circular policy rewrite during Gap DELETE.
create function public.cablemint_gap_cleanup_complete(gap_user uuid,gap_project uuid,gap_id uuid) returns boolean
 language plpgsql security invoker set search_path='' as $$
begin
 if gap_user<>(select auth.uid()) or not exists(select 1 from public.field_projects p where p.id=gap_project and p.user_id=(select auth.uid())) then return false;end if;
 return not exists(select 1 from public.project_files f where f.user_id=gap_user and f.project_id=gap_project and f.entity_type='gap' and f.entity_id=gap_id)
 and not exists(select 1 from storage.objects o where o.bucket_id='project-files' and o.name like gap_user::text||'/'||gap_project::text||'/gaps/'||gap_id::text||'/%');
end $$;
revoke all on function public.cablemint_gap_cleanup_complete(uuid,uuid,uuid) from public;
grant execute on function public.cablemint_gap_cleanup_complete(uuid,uuid,uuid) to authenticated;
alter policy gap_owner_delete on public.field_gaps using(user_id=(select auth.uid()) and deletion_requested_at is not null
 and exists(select 1 from public.field_projects p where p.id=project_id and p.user_id=(select auth.uid()))
 and exists(select 1 from public.field_gap_deletions d where d.gap_id=field_gaps.id and d.project_id=field_gaps.project_id and d.user_id=field_gaps.user_id)
 and public.cablemint_gap_cleanup_complete(user_id,project_id,id));
