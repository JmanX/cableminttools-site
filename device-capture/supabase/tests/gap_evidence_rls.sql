-- Rollback-only RLS probes. Uses an existing project's IDs internally; prints no user/project identifiers.
begin;
do $test$
#variable_conflict use_variable
declare owner_id uuid;project_id uuid;gap_id uuid:=gen_random_uuid();file_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();path text;rows_changed integer;
begin
 select p.user_id,p.id into owner_id,project_id from public.field_projects p limit 1;
 if owner_id is null then raise exception 'No project available for ownership probes';end if;
 path=owner_id::text||'/'||project_id::text||'/gaps/'||gap_id::text||'/'||file_id::text||'.jpg';
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 set local role authenticated;
 insert into public.field_gaps(id,user_id,project_id,unit_location,category,description,photo_count) values(gap_id,owner_id,project_id,'Synthetic test location','Missing device','Rollback-only ownership test',1);
 if not public.cablemint_gap_storage_write(path) then raise exception 'Owner Storage write should be permitted';end if;
 if public.cablemint_gap_storage_write(other_id::text||'/'||project_id::text||'/gaps/'||gap_id::text||'/'||file_id::text||'.jpg') then raise exception 'Cross-user Storage path permitted';end if;
 if public.cablemint_gap_storage_write(owner_id::text||'/'||other_id::text||'/gaps/'||gap_id::text||'/'||file_id::text||'.jpg') then raise exception 'Cross-project Storage path permitted';end if;
 if public.cablemint_gap_storage_write(owner_id::text||'/'||project_id::text||'/gaps/'||gap_id::text||'/bad.png') then raise exception 'Invalid filename permitted';end if;
 insert into public.project_files(id,user_id,project_id,entity_type,entity_id,storage_path,file_name,mime_type,file_size) values(file_id,owner_id,project_id,'gap',gap_id,path,'synthetic.jpg','image/jpeg',100);
 begin
  insert into public.project_files(id,user_id,project_id,entity_type,entity_id,storage_path,file_name,mime_type,file_size) values(other_id,owner_id,project_id,'gap',gap_id,owner_id::text||'/'||project_id::text||'/gaps/'||gap_id::text||'/'||other_id::text||'.jpg','second.jpg','image/jpeg',100);
  raise exception 'Evidence count guard failed';
 exception when raise_exception then if sqlerrm<>'Gap evidence count exceeded' then raise;end if;end;
 begin
  update public.project_files f set storage_path=owner_id::text||'/'||project_id::text||'/gaps/'||gap_id::text||'/'||other_id::text||'.jpg' where f.id=file_id;
  raise exception 'Immutable file identity guard failed';
 exception when raise_exception then if sqlerrm<>'File ownership, path and identity cannot be changed' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',other_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
 if exists(select 1 from public.field_gaps g where g.id=gap_id) or exists(select 1 from public.project_files f where f.id=file_id) then raise exception 'Cross-user read permitted';end if;
 update public.field_gaps g set description='Must not change' where g.id=gap_id;get diagnostics rows_changed=row_count;if rows_changed<>0 then raise exception 'Cross-user update permitted';end if;
 delete from public.project_files f where f.id=file_id;get diagnostics rows_changed=row_count;if rows_changed<>0 then raise exception 'Cross-user metadata delete permitted';end if;
 begin
  insert into public.field_gaps(id,user_id,project_id,unit_location,category,description) values(other_id,other_id,project_id,'Synthetic','No power','Must be rejected');
  raise exception 'Cross-project insert permitted';
 exception when insufficient_privilege then null;end;
 if public.cablemint_gap_storage_write(path) then raise exception 'Cross-user Storage access permitted';end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 update public.field_gaps g set status='resolved',resolved_at=now() where g.id=gap_id;
 if not exists(select 1 from public.project_files f where f.id=file_id) then raise exception 'Resolving removed evidence';end if;
 delete from public.field_gaps g where g.id=gap_id;get diagnostics rows_changed=row_count;if rows_changed<>0 then raise exception 'Gap deleted without cleanup marker';end if;
 insert into public.field_gap_deletions(user_id,project_id,gap_id) values(owner_id,project_id,gap_id);
 update public.field_gaps g set deletion_requested_at=now() where g.id=gap_id;
 if public.cablemint_gap_storage_write(path) then raise exception 'Deleted Gap accepts uploads';end if;
 delete from public.field_gaps g where g.id=gap_id;get diagnostics rows_changed=row_count;if rows_changed<>0 then raise exception 'Gap deleted before metadata cleanup';end if;
 delete from public.project_files f where f.id=file_id;
 delete from public.field_gaps g where g.id=gap_id;get diagnostics rows_changed=row_count;if rows_changed<>1 then raise exception 'Owner cleanup could not delete Gap';end if;
 begin
  insert into public.field_gaps(id,user_id,project_id,unit_location,category,description) values(gap_id,owner_id,project_id,'Synthetic','No power','Deleted Gap must not return');
  raise exception 'Deleted Gap recreated';
 exception when insufficient_privilege then null;end;
 set local role anon;
 begin perform count(*) from public.field_gaps;raise exception 'Anonymous Gap table access permitted';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.project_files;raise exception 'Anonymous file table access permitted';exception when insufficient_privilege then null;end;
 reset role;
end $test$;
rollback;
select 'PASS: owner access, cross-user/project denial, anon denial, path validation, photo-count/identity guards, resolution retention, cleanup order and deletion retry protection; all fixture writes rolled back' as result;
