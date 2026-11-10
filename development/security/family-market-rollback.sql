begin;
DO $test$
declare guardian uuid:=gen_random_uuid();child uuid:=gen_random_uuid();other uuid:=gen_random_uuid();gs uuid:=gen_random_uuid();cs uuid:=gen_random_uuid();os uuid:=gen_random_uuid();invite jsonb;s jsonb;denied boolean;
begin
 if(select count(*)from study_private.app_profiles where cardinality(installed)=9)<>4 then raise exception 'Existing four accounts did not retain nine extensions';end if;
 insert into auth.users(id,email,email_confirmed_at)values(guardian,'family-test-'||guardian||'@example.invalid',now()),(child,'family-test-'||child||'@example.invalid',now()),(other,'family-test-'||other||'@example.invalid',now());
 insert into auth.sessions(id,user_id)values(gs,guardian),(cs,child),(os,other);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',guardian,'session_id',gs,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',guardian::text,true);
 s:=public.study_app_control('state');if jsonb_array_length(s->'installed')<>0 then raise exception 'New accounts must have no extensions';end if;
 s:=public.study_app_control('profile','{"revision":0,"kind":"guardian","name":"検査用保護者"}');invite:=public.study_app_control('invite');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',child,'session_id',cs,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',child::text,true);
 s:=public.study_app_control('profile','{"revision":0,"kind":"child","name":"検査用子供"}');
 denied:=false;begin perform public.study_app_control('invite_accept',jsonb_build_object('code',invite->>'code','confirm','wrong'));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Consent bypass';end if;
 s:=public.study_app_control('invite_accept',jsonb_build_object('code',invite->>'code','confirm','連携する'));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',guardian,'session_id',gs,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',guardian::text,true);
 s:=public.study_app_control('policy',jsonb_build_object('child',child,'revision',1,'blocked',jsonb_build_array('games'),'focus_minutes',30,'focus_blocks',jsonb_build_array('timer')));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',child,'session_id',cs,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',child::text,true);
 denied:=false;begin perform public.study_app_control('install','{"revision":1,"feature":"games","enabled":true}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Guardian restriction bypass';end if;
 s:=public.study_app_control('focus_end','{"revision":1}');if(s->'available'->>'games')::boolean or(s->'available'->>'timer')::boolean then raise exception 'Child cleared guardian restrictions';end if;
 denied:=false;begin perform public.study_app_control('profile',jsonb_build_object('revision',s->'revision','kind','guardian','name','spoof'));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Role escape';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other,'session_id',os,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',other::text,true);
 denied:=false;begin perform public.study_app_control('policy',jsonb_build_object('child',child,'revision',2,'blocked','[]'::jsonb));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unrelated guardian access';end if;
 denied:=false;begin perform public.study_app_control('invite_accept',jsonb_build_object('code',invite->>'code','confirm','連携する'));exception when invalid_parameter_value then denied:=true;end;if not denied then raise exception 'Invite reuse';end if;
 if has_function_privilege('anon','public.study_app_control(text,jsonb)','execute')then raise exception 'Anonymous access';end if;
 if public.study_feature_allowed('games')then raise exception 'Uninstalled game permission';end if;
end $test$;
select 'PASS: existing four retain all nine; new accounts empty; explicit consent, one-use invite, guardian isolation, child restrictions, focus and role-escape protection; all writes rolled back' as result;
rollback;
