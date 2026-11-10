-- The existing settings.owner_id remains the single, immutable-by-API supreme owner.
create table study_private.owner_members(
 user_id uuid primary key references auth.users(id) on delete cascade,
 added_by uuid not null,created_at timestamptz not null default now()
);
alter table study_private.owner_members enable row level security;
revoke all on study_private.owner_members from public,anon,authenticated,service_role;
create function study_private.is_owner(actor uuid)returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(actor=(select owner_id from study_private.settings where singleton),false)
 or exists(select 1 from study_private.owner_members where user_id=actor);
$$;
revoke all on function study_private.is_owner(uuid) from public,anon,authenticated,service_role;
-- Change only authority comparisons, never personal deck ownership predicates.
do $$declare r record;s text;old text;begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='study_private'and p.proname in('dispatch_v4','dispatch_v5'))or(n.nspname='public'and p.proname='study_account')loop
  old:=pg_get_functiondef(r.oid);s:=old;
  s:=replace(s,'p_actor<>v_owner','not study_private.is_owner(p_actor)');
  s:=replace(s,'p_actor=v_owner','study_private.is_owner(p_actor)');
  s:=replace(s,'v_target=v_owner','study_private.is_owner(v_target)');
  s:=replace(s,'''owner'',p.id=v_owner','''owner'',study_private.is_owner(p.id),''supremeOwner'',p.id=v_owner');
  if r.proname='dispatch_v4' then
   s:=replace(s,'''owner'',study_private.is_owner(p_actor),''accounts''','''owner'',study_private.is_owner(p_actor),''supremeOwner'',p_actor=v_owner,''accounts''');
  end if;
  if s=old then raise exception 'Owner authority upgrade precondition failed: %',r.proname;end if;
  execute s;
 end loop;
 -- A protected audit deletion receipt must accept a delegated owner too.
 select pg_get_functiondef('study_private.guard_audit()'::regprocedure)into s;
 if strpos(s,'r.reviewer=s.owner_id')=0 then raise exception 'Audit guard precondition failed';end if;
 execute replace(s,'r.reviewer=s.owner_id','study_private.is_owner(r.reviewer)');
 -- Maintenance, notices, music, storage and moderation already rely on this status.
 select pg_get_functiondef('study_private.security_status(uuid,uuid)'::regprocedure)into s;
 if strpos(s,'p_actor=(select owner_id from study_private.settings where singleton)')=0 then raise exception 'Security status precondition failed';end if;
 s:=replace(s,'p_actor=(select owner_id from study_private.settings where singleton)','study_private.is_owner(p_actor)');
 s:=replace(s,'''owner'',r.owner,','''owner'',r.owner,''supremeOwner'',r.owner and p_actor=(select owner_id from study_private.settings where singleton),');
 execute s;
 select pg_get_functiondef('public.study_data_guard_admin(text,uuid,text,timestamptz)'::regprocedure)into s;
 if strpos(s,'auth.uid() is distinct from (select owner_id from study_private.settings where singleton)')=0 then raise exception 'Backup authority precondition failed';end if;
 execute replace(s,'auth.uid() is distinct from (select owner_id from study_private.settings where singleton)','not study_private.is_owner(auth.uid())');
 -- Retained legacy editor authorization remains disabled for paid processing.
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname in('study_editor_access','study_editor_job')loop
  s:=pg_get_functiondef(r.oid);
  s:=replace(s,'p_actor=(select owner_id from study_private.settings where singleton)','study_private.is_owner(p_actor)');
  s:=replace(s,'actor=(select owner_id from study_private.settings where singleton)','study_private.is_owner(actor)');execute s;
 end loop;
end $$;
-- Authenticated, password-verified endpoint; no actor/role is accepted from the browser.
create function public.study_owner_add(p_target uuid,p_confirm text)returns jsonb
 language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();root_owner uuid;
begin
 perform study_private.assert_admin_verified();
 select owner_id into root_owner from study_private.settings where singleton for update;
 if actor is null or actor is distinct from root_owner then raise exception 'オーナーを追加できるのは最高オーナーだけです。'using errcode='42501';end if;
 if p_target is null or p_confirm is distinct from p_target::text then raise exception '対象のアカウントIDを確認してください。'using errcode='22023';end if;
 if p_target=root_owner then raise exception '最高オーナーはすでに登録されています。'using errcode='22023';end if;
 if not study_private.active_account(p_target)or not exists(select 1 from auth.users where id=p_target and email_confirmed_at is not null and not is_anonymous)then raise exception 'メール確認済みで利用可能なアカウントを選んでください。'using errcode='22023';end if;
 if exists(select 1 from study_private.owner_members where user_id=p_target)then return jsonb_build_object('ok',true,'alreadyOwner',true);end if;
 insert into study_private.admin_members(user_id)values(p_target)on conflict(user_id)do nothing;
 insert into study_private.owner_members(user_id,added_by)values(p_target,actor);
 insert into study_private.audit_events(actor,action,target,outcome,details,protected)values(actor,'owner_added',p_target,'success',jsonb_build_object('role','owner'),true);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.study_owner_add(uuid,text)from public,anon,service_role;
grant execute on function public.study_owner_add(uuid,text)to authenticated;
notify pgrst,'reload schema';
