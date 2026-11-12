create table study_private.signup_challenges (
 id uuid primary key default gen_random_uuid(),
 email_hash bytea not null,
 answer smallint not null,
 created_at timestamptz not null default clock_timestamp(),
 checked boolean not null default false,
 receipt uuid unique
);
create index signup_challenges_created on study_private.signup_challenges(created_at);
create index signup_challenges_email_created on study_private.signup_challenges(email_hash,created_at);
alter table study_private.signup_challenges enable row level security;
revoke all on study_private.signup_challenges from public,anon,authenticated;

create function public.study_signup_challenge(p_email text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare email text := lower(btrim(p_email)); h bytea; a int; b int; token uuid;
begin
 if email is null or length(email) not between 3 and 254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
  raise exception 'メールアドレスを確認してください。' using errcode='22023';
 end if;
 if not pg_try_advisory_xact_lock(20261112,77) then
  raise sqlstate 'PT429' using message='少し待ってからやり直してください。';
 end if;
 h:=sha256(convert_to(email,'UTF8'));
 delete from study_private.signup_challenges where created_at < statement_timestamp()-interval '15 minutes';
 if (select count(*) from study_private.signup_challenges)>=300 or
    (select count(*) from study_private.signup_challenges where email_hash=h)>=5 then
  raise sqlstate 'PT429' using message='確認の上限に達しました。15分後にお試しください。';
 end if;
 a:=floor(random()*18+2); b:=floor(random()*18+2);
 insert into study_private.signup_challenges(email_hash,answer) values(h,a+b) returning id into token;
 return jsonb_build_object('id',token,'left',a,'right',b);
end $$;

create function public.study_signup_answer(p_id uuid,p_email text,p_answer integer) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare token uuid;
begin
 if p_email is null or length(p_email)>254 or p_id is null or p_answer is null then return null;end if;
 update study_private.signup_challenges
 set checked=true,receipt=case when answer=p_answer then gen_random_uuid() end
 where id=p_id and email_hash=sha256(convert_to(lower(btrim(p_email)),'UTF8')) and not checked
   and created_at>statement_timestamp()-interval '3 minutes'
 returning receipt into token;
 return token;
end $$;

create function public.study_signup_guard(event jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare e text:=event#>>'{user,email}'; proof text:=event#>>'{user,user_metadata,study_signup_proof}'; found_id uuid;
begin
 if coalesce(proof,'') ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    and length(e) between 3 and 254 then
  update study_private.signup_challenges set receipt=null
  where receipt=proof::uuid and checked and email_hash=sha256(convert_to(lower(btrim(e)),'UTF8'))
   and created_at>statement_timestamp()-interval '3 minutes'
  returning id into found_id;
 end if;
 if found_id is null then
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','登録画面で操作確認をやり直してください。'));
 end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.study_signup_challenge(text),public.study_signup_answer(uuid,text,integer),public.study_signup_guard(jsonb) from public,anon,authenticated;
grant execute on function public.study_signup_challenge(text),public.study_signup_answer(uuid,text,integer) to anon;
grant execute on function public.study_signup_guard(jsonb) to supabase_auth_admin;
