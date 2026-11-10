'use strict';
(() => {
 const cfg=window.STUDY_CONFIG;
 const fail=message=>{throw new Error(message);};
 if (!cfg || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.supabaseUrl) || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(cfg.publishableKey)) { window.Study={setupError:'config.jsの接続設定を確認してください。'};return; }
 if (!window.supabase) {window.Study={setupError:'認証サービスを読み込めませんでした。再読み込みしてください。'};return;}
 const storageKey='sb-'+new URL(cfg.supabaseUrl).hostname.split('.')[0]+'-auth-token';
 try{const old=window.sessionStorage.getItem(storageKey);if(old && !window.localStorage.getItem(storageKey))window.localStorage.setItem(storageKey,old);window.sessionStorage.removeItem(storageKey);}catch{window.Study={setupError:'ログイン状態を保存できません。ブラウザーのサイトデータ保存を許可してください。'};return;}
 const client=window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{storage:window.localStorage,storageKey,flowType:'implicit',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

 const authRoot=new URL('.',document.currentScript.src);let authSupportPromise;
 function authSupport(){if(window.StudyAuthSupport)return Promise.resolve(window.StudyAuthSupport);if(authSupportPromise)return authSupportPromise;authSupportPromise=new Promise((resolve,reject)=>{const script=document.createElement('script'),timer=setTimeout(()=>reject(new Error('認証補助の読み込みが時間切れです。')),15000);script.src=new URL('auth-support.js?v=20261110auth',authRoot);script.onload=()=>{clearTimeout(timer);window.StudyAuthSupport?resolve(window.StudyAuthSupport):reject(new Error('認証補助を確認できません。'));};script.onerror=()=>{clearTimeout(timer);authSupportPromise=null;reject(new Error('認証補助を読み込めません。'));};document.head.append(script);});return authSupportPromise;}
 for(const method of ['signInWithPassword','signUp','signInWithOtp','resend','resetPasswordForEmail']){const original=client.auth[method].bind(client.auth);client.auth[method]=async(...args)=>{const token=await(await authSupport()).challenge();if(token){if(method==='resetPasswordForEmail')args[1]={...args[1],captchaToken:token};else args[0]={...args[0],options:{...args[0]?.options,captchaToken:token}};}return original(...args);};}
 if(location.pathname.endsWith('/account.html'))void authSupport().catch(()=>{});
 async function request(body, suffix='') {
  if(!(body instanceof FormData)&&['admin_verify','admin_password_set','account_self_delete'].includes(body.action)){const token=await(await authSupport()).challenge();if(token)body={...body,input:{...body.input,captchaToken:token}};}
  const {data,error}=await client.auth.getSession();
  if(error) fail('ログインし直してください。');
  const headers={apikey:cfg.publishableKey};
  if(data.session?.access_token) headers.Authorization='Bearer '+data.session.access_token;
  if(!(body instanceof FormData)) headers['Content-Type']='application/json';
  let res,json;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  const timeout=()=>fail('45秒以内に応答を確認できませんでした。保存・送信が完了している場合もあるため、一覧や残高を確認してから再試行してください。');
  try {
   try {res=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/study-api'+suffix,{method:'POST',headers,body:body instanceof FormData?body:JSON.stringify(body),cache:'no-store',signal:controller.signal});} catch {if(controller.signal.aborted)timeout();fail('サーバーに接続できません。Edge Functionの公開と設定を確認してください。');}
   try {json=await res.json();} catch {if(controller.signal.aborted)timeout();fail('サーバーの応答を読めませんでした。');}
  }finally{clearTimeout(timer);}
  if(!res.ok || json.error){const e=new Error(json.error || 'サーバー設定を確認してください。');e.status=res.status;throw e;}
  return json.data;
 }
 window.Study={client,storageKey,sendFeedback:form=>request(form,'?action=feedback_submit'),api:(action,input={})=>request({action,input}),upload:image=>{const f=new FormData();f.set('image',image);return request(f);}};
})();
