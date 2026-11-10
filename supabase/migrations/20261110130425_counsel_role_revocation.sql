-- Human review by the sole supreme owner. Never infer or automatically punish a suspected breach.
create function public.study_counsel_revoke(p_target uuid,p_confirm text)returns jsonb
 language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid();root_owner uuid;existed boolean;
begin
 perform study_private.assert_admin_verified();
 select owner_id into root_owner from study_private.settings where singleton for update;
 if v_actor is null or v_actor is distinct from root_owner then raise exception '権限をはく奪できるのは最高オーナーだけです。'using errcode='42501';end if;
 if p_target is null or p_confirm is distinct from p_target::text then raise exception '対象の確認が必要です。'using errcode='22023';end if;
 if p_target=root_owner then raise exception '最高オーナー自身はこの画面から解除できません。'using errcode='22023';end if;
 existed:=exists(select 1 from study_private.admin_members where user_id=p_target)or exists(select 1 from study_private.owner_members where user_id=p_target);
 if not existed then return jsonb_build_object('ok',true,'alreadyRemoved',true);end if;
 delete from study_private.admin_verified_sessions where actor=p_target;
 delete from study_private.counsel_pledges where actor=p_target;
 delete from study_private.owner_members where user_id=p_target;
 delete from study_private.admin_members where user_id=p_target;
 insert into study_private.audit_events(actor,action,target,outcome,details,protected)values(v_actor,'counsel_roles_revoked',p_target,'success',jsonb_build_object('reason','confidentiality_policy','roles',jsonb_build_array('admin','owner')),true);
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.study_counsel_revoke(uuid,text)from public,anon,service_role;
grant execute on function public.study_counsel_revoke(uuid,text)to authenticated;
