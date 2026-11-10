-- Execute as a maintenance transaction. Every synthetic record and role change rolls back.
begin;
DO $test$
declare supreme uuid;target uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();target_session uuid:=gen_random_uuid();status jsonb;blocked boolean;
begin
 select owner_id into supreme from study_private.settings where singleton;
 insert into auth.users(id,email,email_confirmed_at)values(target,'owner-test-'||target||'@example.invalid',now()),(outsider,'owner-test-'||outsider||'@example.invalid',now());
 insert into auth.sessions(id,user_id)values(sid,supreme),(target_session,target);
 insert into study_private.admin_verified_sessions(actor,session_id,expires_at,password_revision)select supreme,sid,now()+interval'1 minute',revision from study_private.admin_password_settings where singleton;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',supreme,'session_id',sid,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',supreme::text,true);
 status:=public.study_security_status();
 if not coalesce((status->>'supremeOwner')::boolean,false)or not coalesce((status->>'adminVerified')::boolean,false)then raise exception 'Supreme verification failed';end if;
 perform public.study_owner_add(target,target::text);
 if not study_private.is_owner(target)or not exists(select 1 from study_private.admin_members where user_id=target)then raise exception 'Promotion failed';end if;
 if (study_private.dispatch_v4(target,'admin_bootstrap','{}')->>'owner')::boolean is distinct from true then raise exception 'Owner authority missing';end if;
 if (study_private.dispatch_v4(target,'admin_bootstrap','{}')->>'supremeOwner')::boolean is distinct from false then raise exception 'Supreme authority leaked';end if;
 insert into study_private.admin_verified_sessions(actor,session_id,expires_at,password_revision)select target,target_session,now()+interval'1 minute',revision from study_private.admin_password_settings where singleton;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',target,'session_id',target_session,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',target::text,true);
 blocked:=false;begin perform public.study_owner_add(outsider,outsider::text);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Delegated owner promoted another user';end if;
 status:=public.study_security_status();if not(status->>'owner')::boolean or(status->>'supremeOwner')::boolean then raise exception 'Owner status invalid';end if;
 blocked:=false;begin perform study_private.dispatch_v4(target,'remove_admin',jsonb_build_object('target',supreme));exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Supreme protection missing';end if;
 if has_function_privilege('anon','public.study_owner_add(uuid,text)','execute')then raise exception 'Anonymous permission leaked';end if;
 if exists(select 1 from study_private.owner_members where user_id=outsider)then raise exception 'Unexpected promotion';end if;
end $test$;
select 'PASS: supreme-only promotion, delegated owner authority, protected supreme, anonymous denial; all test writes rolled back' as result;
rollback;
