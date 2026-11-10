-- Private human replies; no external AI, email, tracking, or source-media storage.
create table study_private.counsel_threads(
 id uuid primary key default gen_random_uuid(),actor uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title)between 1 and 80),state text not null default 'open' check(state in('open','answered','closed')),
 revision bigint not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index counsel_actor_updated on study_private.counsel_threads(actor,updated_at desc,id);
create index counsel_state_updated on study_private.counsel_threads(state,updated_at desc,id);
create table study_private.counsel_messages(
 id uuid primary key,thread uuid not null references study_private.counsel_threads(id) on delete cascade,
 author uuid not null references auth.users(id) on delete cascade,staff boolean not null,body text not null check(length(body)between 1 and 8000),
 created_at timestamptz not null default now()
);
create index counsel_messages_thread on study_private.counsel_messages(thread,created_at,id);
create index counsel_messages_author_time on study_private.counsel_messages(author,created_at desc);
create table study_private.counsel_pledges(
 actor uuid not null references auth.users(id) on delete cascade,session_id uuid not null references auth.sessions(id) on delete cascade,
 version integer not null check(version=1),accepted_at timestamptz not null default now(),primary key(actor,session_id)
);
alter table study_private.counsel_threads enable row level security;
alter table study_private.counsel_messages enable row level security;
alter table study_private.counsel_pledges enable row level security;
revoke all on study_private.counsel_threads,study_private.counsel_messages,study_private.counsel_pledges from public,anon,authenticated,service_role;
create function public.study_counsel(p_action text default 'list',p_input jsonb default '{}')returns jsonb
 language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid();sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;st jsonb;staff_mode boolean;
 t study_private.counsel_threads;m study_private.counsel_messages;ident uuid;msgid uuid;body_text text;title_text text;page_num integer;rev bigint;
begin
 if not public.study_live_account() or not exists(select 1 from auth.users u where u.id=v_actor and u.email_confirmed_at is not null)then raise exception 'メール確認済みのアカウントでログインしてください。'using errcode='42501';end if;
 st:=public.study_security_status();if not coalesce((st->>'allowed')::boolean,false)then raise exception 'メンテナンス中です。'using errcode='42501';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object'or pg_column_size(p_input)>40000 then raise exception '入力を確認してください。'using errcode='22023';end if;
 staff_mode:=p_input->>'staff'='true';staff_mode:=coalesce(staff_mode,false);
 if p_action not in('status','pledge','list','get','create','reply','close')then raise exception '対応していない操作です。'using errcode='22023';end if;
 if staff_mode or p_action='pledge'then
  if not coalesce((st->>'admin')::boolean,false)or not coalesce((st->>'adminVerified')::boolean,false)then raise exception '管理者専用の本人確認を完了してください。'using errcode='42501';end if;
  if p_action not in('status','pledge')and not exists(select 1 from study_private.counsel_pledges p where p.actor=v_actor and p.session_id=sid and p.version=1 and p.accepted_at>now()-interval '8 hours')then raise exception '相談の秘密を守る確認が必要です。'using errcode='42501';end if;
 end if;
 if p_action='status'then return jsonb_build_object('staff',staff_mode,'pledged',exists(select 1 from study_private.counsel_pledges p where p.actor=v_actor and p.session_id=sid and p.version=1 and p.accepted_at>now()-interval '8 hours'));end if;
 if p_action in('pledge','create','reply','close')then
  if not pg_try_advisory_xact_lock(hashtextextended(v_actor::text,20261110))then raise sqlstate 'PT429'using message='操作が重なりました。少し待ってください。';end if;
 end if;
 if p_action='pledge'then
  if p_input->>'accept' is distinct from 'true' or p_input->>'version' is distinct from '1'then raise exception '守秘義務の内容を確認してチェックしてください。'using errcode='22023';end if;
  insert into study_private.counsel_pledges(actor,session_id,version)values(v_actor,sid,1)on conflict on constraint counsel_pledges_pkey do update set version=1,accepted_at=now();
  return jsonb_build_object('pledged',true);
 end if;
 if p_action='list'then
  page_num:=coalesce((p_input->>'page')::integer,1);if page_num<1 or page_num>500 then raise exception 'ページを確認してください。'using errcode='22023';end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(x order by x.updated_at desc,x.id)from(select c.id,case when staff_mode then '非公開の相談'else c.title end as title,c.state,c.revision,c.created_at,c.updated_at from study_private.counsel_threads c where (staff_mode or c.actor=v_actor)order by c.updated_at desc,c.id limit 20 offset (page_num-1)*20)x),'[]'::jsonb),'page',page_num);
 end if;
 if p_action='create'then
  if staff_mode or p_input->>'consent' is distinct from 'true'then raise exception '相談の取り扱いを確認してください。'using errcode='22023';end if;
  ident:=(p_input->>'id')::uuid;msgid:=(p_input->>'message_id')::uuid;title_text:=btrim(p_input->>'title');body_text:=btrim(p_input->>'body');
  if ident is null or msgid is null or title_text is null or length(title_text)not between 1 and 80 or body_text is null or length(body_text)not between 1 and 8000 then raise exception '件名と相談内容を確認してください。'using errcode='22023';end if;
  select * into t from study_private.counsel_threads c where c.id=ident;
  if found then
   if t.actor=v_actor and t.title=title_text and exists(select 1 from study_private.counsel_messages x where x.thread=ident and x.id=msgid and x.author=v_actor and not x.staff and x.body=body_text)then return jsonb_build_object('id',ident);end if;
   raise exception '保存結果を一覧から確認してください。'using errcode='23505';
  end if;
  if(select count(*)from study_private.counsel_threads c where c.actor=auth.uid()and state<>'closed')>=3 or(select count(*)from study_private.counsel_threads c where c.actor=auth.uid()and created_at>now()-interval '30 days')>=10 then raise sqlstate 'PT429'using message='相談は対応中3件・30日間10件までです。';end if;
  if exists(select 1 from study_private.counsel_messages x where x.author=v_actor and x.created_at>now()-interval '15 seconds')then raise sqlstate 'PT429'using message='連続送信を避け、少し待ってください。';end if;
  if pg_database_size(current_database())>419430400 then raise exception '現在、保存容量の上限に近づいています。後でお試しください。'using errcode='54000';end if;
  insert into study_private.counsel_threads(id,actor,title)values(ident,v_actor,title_text);
  insert into study_private.counsel_messages(id,thread,author,staff,body)values(msgid,ident,v_actor,false,body_text);
  return jsonb_build_object('id',ident);
 end if;
 ident:=(p_input->>'id')::uuid;select * into t from study_private.counsel_threads c where c.id=ident for update;
 if not found or(not staff_mode and t.actor<>v_actor)then raise exception 'この相談は表示・変更できません。'using errcode='42501';end if;
 if p_action='get'then
  return jsonb_build_object('id',t.id,'title',t.title,'state',t.state,'revision',t.revision,'created_at',t.created_at,'messages',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'body',x.body,'staff',x.staff,'created_at',x.created_at)order by x.created_at,x.id)from study_private.counsel_messages x where x.thread=t.id),'[]'::jsonb));
 end if;
 rev:=(p_input->>'revision')::bigint;
 if p_action='close'then
  if rev is distinct from t.revision then raise sqlstate 'PT409'using message='内容が更新されています。開き直してください。';end if;
  update study_private.counsel_threads set state='closed',revision=revision+1,updated_at=now()where id=t.id;
  return jsonb_build_object('closed',true);
 end if;
 if staff_mode and(p_input->>'accept' is distinct from 'true'or p_input->>'version' is distinct from '1')then raise exception '回答する前に秘密を守るチェックが必要です。'using errcode='42501';end if;
 msgid:=(p_input->>'message_id')::uuid;body_text:=btrim(p_input->>'body');
 if msgid is null or body_text is null or length(body_text)not between 1 and 8000 then raise exception '送信する内容を確認してください。'using errcode='22023';end if;
 select * into m from study_private.counsel_messages where id=msgid;
 if found then
  if m.thread=t.id and m.author=v_actor and m.staff=staff_mode and m.body=body_text then return jsonb_build_object('id',t.id);end if;
  raise exception '送信結果を開き直して確認してください。'using errcode='23505';
 end if;
 if t.state='closed'then raise exception 'この相談は終了しています。'using errcode='22023';end if;
 if rev is distinct from t.revision then raise sqlstate 'PT409'using message='新しい返信があります。開き直してください。';end if;
 if(select count(*)from study_private.counsel_messages where thread=t.id)>=60 then raise exception 'この相談は60通に達しました。新しい相談を作ってください。'using errcode='54000';end if;
 if exists(select 1 from study_private.counsel_messages x where x.author=v_actor and x.created_at>now()-interval '15 seconds')then raise sqlstate 'PT429'using message='連続送信を避け、少し待ってください。';end if;
 if pg_database_size(current_database())>419430400 then raise exception '保存容量を確認しています。後でお試しください。'using errcode='54000';end if;
 insert into study_private.counsel_messages(id,thread,author,staff,body)values(msgid,t.id,v_actor,staff_mode,body_text);
 update study_private.counsel_threads set state=case when staff_mode then 'answered'else 'open'end,revision=revision+1,updated_at=now()where id=t.id;
 return jsonb_build_object('id',t.id);
end;
$$;
revoke all on function public.study_counsel(text,jsonb)from public,anon,service_role;
grant execute on function public.study_counsel(text,jsonb)to authenticated;
