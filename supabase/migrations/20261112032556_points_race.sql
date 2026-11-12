create table study_private.point_race_entries (
 actor uuid primary key references auth.users(id) on delete cascade,
 alias uuid not null unique default gen_random_uuid()
);
alter table study_private.point_race_entries enable row level security;
revoke all on study_private.point_race_entries from public,anon,authenticated;

create function public.study_point_race(p_action text default 'list') returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare who uuid := auth.uid(); leaderboard jsonb; mine jsonb;
begin
 if who is null or not public.study_live_account() or not coalesce((public.study_security_status()->>'allowed')::boolean,false) then
  raise exception 'ログイン状態を確認してください。' using errcode='42501';
 end if;
 if p_action='join' then
  insert into study_private.point_race_entries(actor) values(who) on conflict(actor) do nothing;
 elsif p_action='leave' then
  delete from study_private.point_race_entries where actor=who;
 elsif p_action is distinct from 'list' then
  raise exception '操作を確認してください。' using errcode='22023';
 end if;
 with scores as (
  select r.actor,r.alias,coalesce(w.earned,0) as points
  from study_private.point_race_entries r left join study_private.point_wallets w on w.actor=r.actor
 ), ranked as (
  select actor,alias,points,rank() over(order by points desc) as place from scores
 ), shown as (
  select place,alias,jsonb_build_object('place',place,'name','学習者 '||upper(left(alias::text,8)),'points',points,'self',actor=who) as item
  from ranked order by place,alias limit 30
 )
 select coalesce((select jsonb_agg(item order by place,alias) from shown),'[]'::jsonb),
  (select jsonb_build_object('place',place,'points',points,'name','学習者 '||upper(left(alias::text,8))) from ranked where actor=who)
 into leaderboard,mine;
 return jsonb_build_object('rows',leaderboard,'mine',mine);
end $$;
revoke all on function public.study_point_race(text) from public,anon,authenticated;
grant execute on function public.study_point_race(text) to authenticated;
