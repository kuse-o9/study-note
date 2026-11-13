create table study_private.admin_notice_reads (
 actor uuid not null references auth.users(id) on delete cascade,
 notice uuid not null references study_private.study_notices(id) on delete cascade,
 revision integer not null,
 primary key(actor,notice)
);
alter table study_private.admin_notice_reads enable row level security;
revoke all on study_private.admin_notice_reads from public,anon,authenticated;
create function public.study_admin_counts(p_notice uuid default null,p_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor_id uuid:=auth.uid(); s jsonb:=public.study_security_status(); owner_access boolean;
begin
 if actor_id is null or not public.study_live_account() or not coalesce((s->>'allowed')::boolean,false)
 or not coalesce((s->>'admin')::boolean,false) or not coalesce((s->>'adminVerified')::boolean,false) then
  raise exception '管理者の本人確認が必要です。' using errcode='42501';
 end if;
 owner_access:=coalesce((s->>'owner')::boolean,false);
 if p_notice is not null then
  insert into study_private.admin_notice_reads(actor,notice,revision)
   select actor_id,n.id,n.revision from study_private.study_notices n where n.id=p_notice and n.revision=p_revision
   on conflict(actor,notice) do update set revision=greatest(admin_notice_reads.revision,excluded.revision);
  return jsonb_build_object('saved',found);
 end if;
 return jsonb_build_object(
  'feedback',(select count(*) from study_private.feedback f where f.status='new' and not exists(select 1 from study_private.feedback_admin_archive a where a.id=f.id and a.archived)),
  'counsel',(select count(*) from study_private.counsel_threads where state='open'),
  'deletions',case when owner_access then (select count(*) from study_private.deletion_requests where status='pending') end,
  'accounts',case when owner_access then (select count(*) from study_private.account_requests where status='pending' and requester is distinct from target) end,
  'customer',(select count(*) from study_private.study_notices n where n.kind='customer' and not exists(select 1 from study_private.admin_notice_reads r where r.actor=actor_id and r.notice=n.id and r.revision=n.revision)),
  'admin',(select count(*) from study_private.study_notices n where n.kind='admin' and not exists(select 1 from study_private.admin_notice_reads r where r.actor=actor_id and r.notice=n.id and r.revision=n.revision))
 );
end $$;
revoke all on function public.study_admin_counts(uuid,integer) from public,anon,authenticated;
grant execute on function public.study_admin_counts(uuid,integer) to authenticated;
