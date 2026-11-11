alter policy study_extension_media_gate on storage.objects using (
 case bucket_id
 when 'study-music' then
  (select public.study_feature_allowed('bgm')) or (
   (select auth.uid()) is not null and
   (select coalesce((s->>'allowed')::boolean,false) and coalesce((s->>'admin')::boolean,false) and coalesce((s->>'adminVerified')::boolean,false)
    from (select public.study_security_status() as s) verified) and
   (select public.study_live_account())
  )
 when 'study-staff-photos' then (select public.study_feature_allowed('staff'))
 else true end
);
