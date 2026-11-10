-- Account-scoped curated extensions and explicitly accepted family links.
-- No private learning content is exposed to a guardian.
create table study_private.app_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 kind text not null default 'standard' check(kind in ('standard','guardian','child')),
 display_name text not null default '' check(length(display_name)<=30),
 installed text[] not null default '{}',focus_blocks text[] not null default '{}',focus_until timestamptz,
 revision bigint not null default 0,changed_at timestamptz not null default now()
);
create table study_private.family_links(
 child uuid primary key references study_private.app_profiles(user_id) on delete cascade,
 guardian uuid not null references study_private.app_profiles(user_id) on delete cascade,
 blocked text[] not null default '{}',focus_blocks text[] not null default '{}',focus_until timestamptz,
 revision bigint not null default 1,created_at timestamptz not null default now(),check(child<>guardian)
);
create index family_links_guardian on study_private.family_links(guardian);
create table study_private.family_invites(
 id uuid primary key default gen_random_uuid(),guardian uuid not null references study_private.app_profiles(user_id) on delete cascade,
 token_hash text unique not null,created_at timestamptz not null default now(),expires_at timestamptz not null,
 used boolean not null default false
);
create index family_invites_guardian_expiry on study_private.family_invites(guardian,expires_at);
alter table study_private.app_profiles enable row level security;
alter table study_private.family_links enable row level security;
alter table study_private.family_invites enable row level security;
revoke all on study_private.app_profiles,study_private.family_links,study_private.family_invites from public,anon,authenticated,service_role;
create function study_private.app_keys() returns text[] language sql immutable set search_path=pg_catalog as $$
 select array['editor','games','timer','board','chat','teams','notices','staff','bgm']::text[];
$$;
-- Freeze existing accounts at migration time. Future accounts default to no extensions.
do $$declare copied integer;begin
 insert into study_private.app_profiles(user_id,installed)select id,study_private.app_keys()from auth.users;
 get diagnostics copied=row_count;
 if copied<>4 then raise exception '既存4アカウントの確認が必要です。移行を中止しました。';end if;
end $$;
create function study_private.app_array(v jsonb) returns text[] language plpgsql immutable set search_path=pg_catalog as $$
declare r text[];
begin
 if v is null or jsonb_typeof(v)<>'array' or jsonb_array_length(v)>9 then raise exception '拡張機能の選択を確認してください。' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(v)x where jsonb_typeof(x)<>'string')then raise exception '拡張機能の選択を確認してください。'using errcode='22023';end if;
 select coalesce(array_agg(distinct value order by value),'{}')into r from jsonb_array_elements_text(v);
 if not r<@study_private.app_keys()then raise exception '対応していない拡張機能です。'using errcode='22023';end if;
 return r;
end $$;
create function study_private.app_allowed(actor uuid,feature text) returns boolean language sql stable set search_path=pg_catalog as $$
 select actor is not null and study_private.active_account(actor) and feature=any(study_private.app_keys())
 and exists(select 1 from study_private.app_profiles p where p.user_id=actor and feature=any(p.installed)
   and not(coalesce(p.focus_until>now(),false) and feature=any(p.focus_blocks)))
 and not exists(select 1 from study_private.family_links l where l.child=actor and
  (feature=any(l.blocked)or(coalesce(l.focus_until>now(),false)and feature=any(l.focus_blocks))));
$$;
create function study_private.app_reason(actor uuid,feature text) returns text language sql stable set search_path=pg_catalog as $$
 select case
 when exists(select 1 from study_private.family_links l where l.child=actor and (feature=any(l.blocked)or(coalesce(l.focus_until>now(),false)and feature=any(l.focus_blocks))))then 'guardian'
 when exists(select 1 from study_private.app_profiles p where p.user_id=actor and coalesce(p.focus_until>now(),false)and feature=any(p.focus_blocks))then 'focus'
 when not exists(select 1 from study_private.app_profiles p where p.user_id=actor and feature=any(p.installed))then 'not-installed'
 else '' end;
$$;
create function study_private.app_snapshot(actor uuid)returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('version',1,'user_id',actor,'server_now',now(),'kind',coalesce(p.kind,'standard'),'display_name',coalesce(p.display_name,''),
 'revision',coalesce(p.revision,0),'installed',coalesce(to_jsonb(p.installed),'[]'::jsonb),
 'focus',jsonb_build_object('until',p.focus_until,'blocked',coalesce(to_jsonb(p.focus_blocks),'[]'::jsonb),'active',coalesce(p.focus_until>now(),false)),
 'available',(select jsonb_object_agg(k,study_private.app_allowed(actor,k))from unnest(study_private.app_keys())k),
 'reasons',(select jsonb_object_agg(k,study_private.app_reason(actor,k))from unnest(study_private.app_keys())k),
 'guardian',(select jsonb_build_object('name',coalesce(nullif(g.display_name,''),'保護者'),'blocked',l.blocked,'focus_until',l.focus_until,'focus_blocks',l.focus_blocks)from study_private.family_links l join study_private.app_profiles g on g.user_id=l.guardian where l.child=actor),
 'children',(select coalesce(jsonb_agg(jsonb_build_object('id',l.child,'name',coalesce(nullif(c.display_name,''),'子供アカウント'),'installed',c.installed,'blocked',l.blocked,'focus_blocks',l.focus_blocks,'focus_until',l.focus_until,'revision',l.revision)order by l.created_at),'[]'::jsonb)from study_private.family_links l join study_private.app_profiles c on c.user_id=l.child where l.guardian=actor),
 'invites',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'expires_at',i.expires_at)order by i.created_at),'[]'::jsonb)from study_private.family_invites i where i.guardian=actor and not i.used and i.expires_at>now()))
 from (select 1)x left join study_private.app_profiles p on p.user_id=actor;
$$;
-- One authenticated public entrypoint. No target user ID is accepted for self operations.
create function public.study_app_control(p_action text default 'state',p_input jsonb default '{}')returns jsonb
 language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();p study_private.app_profiles;l study_private.family_links;i study_private.family_invites;
 target uuid;keys text[];minutes integer;v_kind text;label text;code text;st jsonb;
begin
 if not public.study_live_account() or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null)then raise exception 'メール確認済みのアカウントでログインしてください。'using errcode='42501';end if;
 st:=public.study_security_status();if not coalesce((st->>'allowed')::boolean,false)then raise exception 'メンテナンス中です。'using errcode='42501';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or pg_column_size(p_input)>4096 then raise exception '入力を確認してください。'using errcode='22023';end if;
 if p_action='state'then return study_private.app_snapshot(actor);end if;
 if p_action not in ('profile','install','focus_start','focus_end','invite','invite_preview','invite_accept','invite_revoke','policy','unlink')then raise exception '対応していない操作です。'using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended(actor::text,185810))then raise sqlstate 'PT429'using message='操作が重なりました。少し待ってください。';end if;
 if not exists(select 1 from study_private.app_profiles where user_id=actor)then
  if(select count(*)from study_private.app_profiles)>=10000 or pg_database_size(current_database())>419430400 then raise exception '設定の保存上限です。'using errcode='54000';end if;
  insert into study_private.app_profiles(user_id)values(actor);
 end if;
 select * into p from study_private.app_profiles where user_id=actor for update;
 if p_action in ('profile','install','focus_start','focus_end')and (p_input->>'revision')::bigint is distinct from p.revision then raise exception '別の画面で設定が変更されました。読み直してください。'using errcode='40001';end if;
 if p_action='profile'then
  v_kind:=p_input->>'kind';label:=trim(coalesce(p_input->>'name',''));
  if v_kind is null or v_kind not in ('standard','guardian','child')or length(label)>30 or label~'[[:cntrl:]]'then raise exception '区分と30文字以内の名前を確認してください。'using errcode='22023';end if;
  if v_kind<>p.kind and exists(select 1 from study_private.family_links where child=actor or guardian=actor)then raise exception '家族と連携中は区分を変更できません。連携した保護者に解除を依頼してください。'using errcode='42501';end if;
  update study_private.app_profiles set kind=v_kind,display_name=label,revision=revision+1,changed_at=clock_timestamp()where user_id=actor;
  if v_kind<>'guardian'then update study_private.family_invites set used=true where guardian=actor and not used;end if;
 elsif p_action='install'then
  code:=p_input->>'feature';if code is null or not code=any(study_private.app_keys())or jsonb_typeof(p_input->'enabled')is distinct from 'boolean'then raise exception '拡張機能を確認してください。'using errcode='22023';end if;
  if(p_input->>'enabled')::boolean then
   if exists(select 1 from study_private.family_links where child=actor and (code=any(blocked)or(coalesce(focus_until>now(),false)and code=any(focus_blocks))))then raise exception '保護者が利用を制限しています。'using errcode='42501';end if;
   keys:=array(select distinct x from unnest(p.installed||array[code])x order by x);
  else keys:=array_remove(p.installed,code);end if;
  update study_private.app_profiles set installed=keys,revision=revision+1,changed_at=clock_timestamp()where user_id=actor;
 elsif p_action in ('focus_start','focus_end')then
  keys:=case when p_action='focus_start'then study_private.app_array(p_input->'blocked')else '{}'::text[]end;
  minutes:=case when p_action='focus_start'then(p_input->>'minutes')::integer else 0 end;
  if minutes is null or(p_action='focus_start'and(minutes not between 1 and 240 or cardinality(keys)=0))then raise exception '集中時間は1〜240分で、制限する機能を選んでください。'using errcode='22023';end if;
  update study_private.app_profiles set focus_blocks=keys,focus_until=case when minutes>0 then now()+make_interval(mins=>minutes)else null end,revision=revision+1,changed_at=clock_timestamp()where user_id=actor;
 elsif p_action='invite'then
  if p.kind<>'guardian'then raise exception '保護者アカウントを選んでください。'using errcode='42501';end if;
  delete from study_private.family_invites where guardian=actor and expires_at<now()-interval '7 days';
  if(select count(*)from study_private.family_links where guardian=actor)>=10 or(select count(*)from study_private.family_invites where guardian=actor and not used and expires_at>now())>=3 then raise exception '子供は10人、未使用の招待は3件までです。'using errcode='54000';end if;
  code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into study_private.family_invites(guardian,token_hash,expires_at)values(actor,md5(code),now()+interval '1 day')returning * into i;
  return jsonb_build_object('code',code,'expires_at',i.expires_at,'id',i.id);
 elsif p_action in ('invite_preview','invite_accept')then
  code:=lower(trim(coalesce(p_input->>'code','')));if code!~'^[0-9a-f]{64}$'then raise exception '招待コードを確認してください。'using errcode='22023';end if;
  select * into i from study_private.family_invites where token_hash=md5(code)and not used and expires_at>now()for update;
  if not found or i.guardian=actor then raise exception '招待コードが無効か期限切れです。'using errcode='22023';end if;
  if not exists(select 1 from study_private.app_profiles where user_id=i.guardian and kind='guardian')or not study_private.active_account(i.guardian)then raise exception '保護者の状態を確認できません。'using errcode='42501';end if;
  if p_action='invite_preview'then return jsonb_build_object('guardian_name',(select coalesce(nullif(display_name,''),'保護者')from study_private.app_profiles where user_id=i.guardian),'expires_at',i.expires_at);end if;
  if p.kind<>'child' or exists(select 1 from study_private.family_links where child=actor or guardian=actor)or p_input->>'confirm' is distinct from '連携する'then raise exception '子供アカウントで連携相手を確認し、承認してください。'using errcode='42501';end if;
  if(select count(*)from study_private.family_links where guardian=i.guardian)>=10 then raise exception '保護者の連携人数の上限です。'using errcode='54000';end if;
  -- Serialize acceptance across different children for this guardian's limit.
  perform 1 from study_private.app_profiles where user_id=i.guardian and kind='guardian' for update;
  if not found or not study_private.active_account(i.guardian)then raise exception '保護者の状態が変わりました。'using errcode='42501';end if;
  if(select count(*)from study_private.family_links where guardian=i.guardian)>=10 then raise exception '保護者の連携人数の上限です。'using errcode='54000';end if;
  insert into study_private.family_links(child,guardian)values(actor,i.guardian);
  update study_private.family_invites set used=true where id=i.id;
 elsif p_action='invite_revoke'then
  update study_private.family_invites set used=true where id=(p_input->>'id')::uuid and guardian=actor;
  if not found then raise exception '自分の招待だけを取り消せます。'using errcode='42501';end if;
 elsif p_action in ('policy','unlink')then
  target:=(p_input->>'child')::uuid;select * into l from study_private.family_links where child=target and guardian=actor for update;
  if not found or p.kind<>'guardian'then raise exception '連携した保護者だけが操作できます。'using errcode='42501';end if;
  if(p_input->>'revision')::bigint is distinct from l.revision then raise exception '子供の設定が変更されました。読み直してください。'using errcode='40001';end if;
  if p_action='unlink'then
   if p_input->>'confirm'is distinct from '連携を解除する'then raise exception '連携解除の確認が必要です。'using errcode='22023';end if;
   delete from study_private.family_links where child=target and guardian=actor;
  else
   keys:=study_private.app_array(p_input->'blocked');minutes:=nullif(p_input->>'focus_minutes','')::integer;
   if minutes is not null and minutes not between 0 and 240 then raise exception '集中時間は0〜240分です。'using errcode='22023';end if;
   update study_private.family_links set blocked=keys,focus_blocks=case when minutes is null then l.focus_blocks when minutes=0 then '{}'::text[]else study_private.app_array(p_input->'focus_blocks')end,
    focus_until=case when minutes is null then l.focus_until when minutes=0 then null else now()+make_interval(mins=>minutes)end,revision=revision+1 where child=target and guardian=actor;
  end if;
 end if;
 return study_private.app_snapshot(actor);
end $$;
revoke all on function public.study_app_control(text,jsonb)from public,anon,service_role;
grant execute on function public.study_app_control(text,jsonb)to authenticated;
-- A read-only authorization predicate used by API functions and restrictive RLS.
create function public.study_feature_allowed(p_feature text)returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select public.study_live_account() and study_private.app_allowed(auth.uid(),p_feature);
$$;
revoke all on function public.study_feature_allowed(text)from public;
grant execute on function public.study_feature_allowed(text)to anon,authenticated;
revoke all on function study_private.app_keys(),study_private.app_array(jsonb),study_private.app_allowed(uuid,text),study_private.app_reason(uuid,text),study_private.app_snapshot(uuid)from public,anon,authenticated,service_role;
-- Existing owner/admin authorization remains inside each original routine.
DO $guard$
declare r record;def text;gate text;
begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname in ('study_board','study_board_report','study_chat','study_teams','study_music','study_notices','study_staff_updates','study_editor_access')loop
  gate:=case r.proname
   when 'study_board'then 'if p_action not in (''moderation'',''hide'',''show'') and not public.study_feature_allowed(''board'')then raise exception ''掲示板は未追加、または利用制限中です。''using errcode=''42501'';end if;'
   when 'study_board_report'then 'if p_action=''report''and not public.study_feature_allowed(''board'')then raise exception ''掲示板を利用できません。''using errcode=''42501'';end if;'
   when 'study_chat'then 'if not public.study_feature_allowed(''chat'')then raise exception ''チャットは未追加、または利用制限中です。''using errcode=''42501'';end if;'
   when 'study_teams'then 'if not public.study_feature_allowed(''teams'')then raise exception ''協力ミッションは未追加、または利用制限中です。''using errcode=''42501'';end if;'
   when 'study_music'then 'if p_action=''list''and not public.study_feature_allowed(''bgm'')then raise exception ''学習用BGMは未追加、または利用制限中です。''using errcode=''42501'';end if;'
   when 'study_notices'then 'if p_action=''customer_list''and not public.study_feature_allowed(''notices'')then raise exception ''お知らせは未追加、または利用制限中です。''using errcode=''42501'';end if;'
   when 'study_staff_updates'then 'if p_action=''list''and not public.study_feature_allowed(''staff'')then raise exception ''つぶやきは未追加、または利用制限中です。''using errcode=''42501'';end if;'
   when 'study_editor_access'then 'if p_action in (''status'',''request'')and not public.study_feature_allowed(''editor'')then raise exception ''動画編集は未追加、または利用制限中です。''using errcode=''42501'';end if;'
  end;
  def:=pg_get_functiondef(r.oid);def:=regexp_replace(def,'\mbegin\M','begin'||E'\n '||gate,'i');execute def;
 end loop;
end $guard$;
create or replace function public.study_game_catalog()returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'path',path,'published',published,'note',note,'revision',revision,'updated_at',updated_at)order by id),'[]'::jsonb)
 from study_private.game_publication where public.study_feature_allowed('games');
$$;
create policy study_extension_game_save_gate on public.game_saves as restrictive for all to authenticated
 using((select public.study_feature_allowed('games')))with check((select public.study_feature_allowed('games')));
create policy study_extension_media_gate on storage.objects as restrictive for select to anon,authenticated
 using(case bucket_id when 'study-music'then(select public.study_feature_allowed('bgm'))when 'study-staff-photos'then(select public.study_feature_allowed('staff'))else true end);
notify pgrst,'reload schema';
