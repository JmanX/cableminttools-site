-- Rollback-only Storage RLS regression probes. No blobs or durable customer changes.
begin;
do $test$
#variable_conflict use_variable
declare owner_id uuid;project_id uuid;gap_id uuid:=gen_random_uuid();file_id uuid:='a614734d-c0a1-4a12-a79b-481e33d3227f';other_id uuid:=gen_random_uuid();path text;changed integer;object_id uuid;bad_path text;delete_rule text;
begin
 select p.user_id,p.id into owner_id,project_id from public.field_projects p limit 1;
 if owner_id is null then raise exception 'No owned project available for rollback probes';end if;
 select qual into delete_rule from pg_policies where schemaname='storage' and tablename='objects' and policyname='project_files_storage_delete';
 path=owner_id::text||'/'||project_id::text||'/gaps/'||gap_id::text||'/'||file_id::text||'.jpg';
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 set local role authenticated;
 insert into public.field_gaps(id,user_id,project_id,unit_location,category,description,photo_count) values(gap_id,owner_id,project_id,'Synthetic rollback location','Missing device','Storage policy regression fixture',1);
 if not public.cablemint_gap_storage_write(path) then raise exception 'Normal UUID JPG write rejected';end if;
 insert into storage.objects(bucket_id,name,owner_id,metadata) values('project-files',path,owner_id::text,'{"size":100,"mimetype":"image/jpeg"}') returning id into object_id;
 if object_id is null or not exists(select 1 from storage.objects o where o.id=object_id and o.name=path) then raise exception 'Owner INSERT/SELECT failed';end if;
 insert into storage.objects(bucket_id,name,owner_id,metadata) values('project-files',path,owner_id::text,'{"size":100,"mimetype":"image/jpeg"}')
 on conflict(bucket_id,name collate "C") where (archived_at is null) do update set metadata=excluded.metadata;
 if (select count(*) from storage.objects o where o.bucket_id='project-files' and o.name=path)<>1 then raise exception 'Stable Storage upsert duplicated object';end if;
 insert into public.project_files(id,user_id,project_id,entity_type,entity_id,storage_path,file_name,mime_type,file_size) values(file_id,owner_id,project_id,'gap',gap_id,path,'evidence.jpg','image/jpeg',100);
 insert into public.project_files(id,user_id,project_id,entity_type,entity_id,storage_path,file_name,mime_type,file_size) values(file_id,owner_id,project_id,'gap',gap_id,path,'evidence.jpg','image/jpeg',100) on conflict(id) do update set file_size=excluded.file_size;
 if (select count(*) from public.project_files f where f.id=file_id)<>1 then raise exception 'Stable metadata retry duplicated file';end if;
 foreach bad_path in array array[
  owner_id::text||'/'||other_id::text||'/gaps/'||gap_id::text||'/'||file_id::text||'.jpg',
  owner_id::text||'/'||project_id::text||'/gaps/'||other_id::text||'/'||file_id::text||'.jpg',
  owner_id::text||'/'||project_id::text||'/devices/'||gap_id::text||'/'||file_id::text||'.jpg',
  path||'/extra',replace(path,'.jpg','.png'),replace(path,'.jpg',chr(92)||'.jpg')
 ] loop
  begin insert into storage.objects(bucket_id,name,owner_id) values('project-files',bad_path,owner_id::text);raise exception 'Invalid path allowed';exception when insufficient_privilege then null;end;
 end loop;
 perform set_config('request.jwt.claim.sub',other_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
 if exists(select 1 from storage.objects o where o.id=object_id) then raise exception 'Cross-account Storage read allowed';end if;
 update storage.objects o set metadata='{}' where o.id=object_id;get diagnostics changed=row_count;if changed<>0 then raise exception 'Cross-account update allowed';end if;
 execute format('select count(*) from storage.objects where id=$1 and (%s)',delete_rule) into changed using object_id;if changed<>0 then raise exception 'Cross-account DELETE policy allowed';end if;
 begin insert into storage.objects(bucket_id,name,owner_id) values('project-files',replace(path,owner_id::text,other_id::text),other_id::text);raise exception 'Cross-account Gap upload allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 insert into public.field_gap_deletions(user_id,project_id,gap_id) values(owner_id,project_id,gap_id);
 if public.cablemint_gap_storage_write(path) then raise exception 'Deletion marker did not block upload';end if;
 begin update storage.objects o set metadata='{}' where o.id=object_id;get diagnostics changed=row_count;if changed<>0 then raise exception 'Deleting Gap photo overwritten';end if;exception when insufficient_privilege then null;end;
 update public.field_gaps g set deletion_requested_at=now() where g.id=gap_id;
 if not exists(select 1 from storage.objects o where o.id=object_id) then raise exception 'Cleanup cannot read owned objects';end if;
 delete from public.field_gaps g where g.id=gap_id;get diagnostics changed=row_count;if changed<>0 then raise exception 'Gap deleted before evidence cleanup';end if;
 -- Supabase prohibits direct Storage DELETE even in rollback probes. Evaluate the exact policy without bypassing that guard.
 execute format('select count(*) from storage.objects where id=$1 and (%s)',delete_rule) into changed using object_id;if changed<>1 then raise exception 'Owner cleanup DELETE policy failed';end if;
 set local role anon;
 if exists(select 1 from storage.objects o where o.name=path) then raise exception 'Anonymous Storage read allowed';end if;
 begin insert into storage.objects(bucket_id,name) values('project-files',path);raise exception 'Anonymous Storage write allowed';exception when insufficient_privilege then null;end;
 reset role;
end $test$;
rollback;
select 'PASS: normal JPG, authenticated Storage INSERT/SELECT/UPDATE/upsert and DELETE policy, stable one-object/metadata identities, malformed/cross-account/project denial, deleting-Gap write rejection and cleanup; all fixtures rolled back' as result;
