/* Account settings are authorized in PostgreSQL. No role is trusted from local storage. */
(function(g){'use strict';if(g.StudyApps){g.StudyApps.rebind?.();return;}const ROOT=new URL('.',document.currentScript.src),manifest=[['editor','動画編集','editor/index.html','素材・音楽・字幕をまとめて編集。'],['games','ゲーム','index.html#game-room','鉄道ゲームとこもれび島。'],['timer','学習タイマー','timer.html','ストップウォッチ・ポモドーロ。'],['board','勉強の掲示板','board.html','学習の質問や工夫を共有。'],['chat','勉強チャット','chat.html','教科別に勉強を相談。'],['teams','協力ミッション','teams.html','友達と学習目標に挑戦。'],['notices','お知らせ','notices.html','運営からのお知らせ。'],['staff','管理者のつぶやき','staff-updates.html','管理者の写真付き投稿。'],['bgm','学習用BGM','index.html','集中を助ける音楽。']].map(([id,title,path,description])=>({id,title,path,description}));let state=null,issue='',session=null,pending=null,epoch=0,parentPolicy=null,overlay=null;const inertBefore=new Map();const empty=()=>Object.fromEntries(manifest.map(x=>[x.id,false]));let available=empty();let resolveReady;const ready=new Promise(r=>resolveReady=r);
 function route(url){const u=new URL(url,ROOT);if(u.origin!==ROOT.origin||!u.pathname.startsWith(ROOT.pathname))return null;const p=u.pathname.slice(ROOT.pathname.length);if(u.hash==='#game-room'||/^(game\/|yamanote\/|railway\/|rail-games\/|depot-3d\.html|operator-floors\.html|game-room\/)/.test(p)||['chuo.html','chuo-local.html','keihin.html','sobu.html'].includes(p))return 'games';return manifest.find(x=>x.id!=='bgm'&&x.id!=='games'&&new URL(x.path,ROOT).pathname===u.pathname)?.id||null;}
 function allowed(id){return available[id]===true&&(!parentPolicy||parentPolicy[id]===true);}
 function reason(id){return issue||({guardian:'保護者の設定で利用が制限されています。',focus:'集中モード中はこの機能を利用できません。','not-installed':'この拡張機能はまだ追加されていません。'}[state?.reasons?.[id]]||(!session?'ログインして、アプリマーケットから追加してください。':'設定を確認しています。'));}
 function hide(){overlay?.remove();overlay=null;for(const [node,value]of inertBefore){if(node.isConnected)node.inert=value;}inertBefore.clear();}
 function show(id){if(!document.body)return;if(overlay&&overlay.dataset.feature===id){overlay.querySelector('p').textContent=reason(id);return;}hide();overlay=document.createElement('div');overlay.id='study-app-block';overlay.dataset.feature=id;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','study-app-block-title');const card=document.createElement('section'),h=document.createElement('h1'),p=document.createElement('p');h.id='study-app-block-title';h.textContent=manifest.find(x=>x.id===id)?.title||'拡張機能';p.textContent=reason(id);card.append(h,p);for(const [text,path]of[['アプリマーケット','app-market.html'],['学習ホームへ','index.html'],['集中モード・設定','focus.html']]){const a=document.createElement('a');a.href=new URL(path,ROOT);a.textContent=text;a.className='button';a.addEventListener('click',e=>{if(path==='index.html'&&!route(location.href)){e.preventDefault();hide();}});card.append(a);}overlay.append(card);document.body.append(overlay);for(const node of document.body.children){if(node!==overlay){inertBefore.set(node,node.inert===true);node.inert=true;}}card.tabIndex=-1;card.focus();}
 function apply(){const id=route(location.href);if(id&&!allowed(id)){show(id);if(overlay)overlay.dataset.routeBlock='1';g.dispatchEvent(new Event('study-app-blocked'));}else if(overlay&&(id||overlay.dataset.routeBlock==='1')){hide();}for(const a of document.querySelectorAll('a[href]')){const feature=route(a.href);if(feature){a.dataset.studyApp=feature;a.classList.toggle('study-app-unavailable',!allowed(feature));a.title=allowed(feature)?'':reason(feature);}}for(const host of document.querySelectorAll('.study-comfort'))host.hidden=!allowed('bgm');const policy=Object.fromEntries(manifest.map(x=>[x.id,allowed(x.id)]));g.dispatchEvent(new CustomEvent('study-app-policy',{detail:policy}));if(verifiedEpoch===epoch)for(const frame of document.querySelectorAll('iframe')){try{frame.contentWindow?.postMessage({type:'study-app-policy',policy,userId:account(session)},ROOT.origin);}catch{}}}
 const account=s=>s?.user?.id??null;
 function authChanged(event,next){
  if(event!=='SIGNED_OUT'&&account(next)===account(session))return;
  epoch++;session=next;state=null;available=empty();parentPolicy=null;issue=next?'アカウントの利用設定を確認しています。':'';apply();
  setTimeout(()=>void refresh(),0);
 }
 async function refresh(){
  if(pending)return pending.then(()=>verifiedEpoch===epoch?undefined:refresh());
  const ticket=epoch;
  pending=(async()=>{
   try{
    const {data,error}=await Study.client.auth.getSession();
    if(ticket!==epoch)return;
    if(error)throw error;
    if(account(data.session)!==account(session))parentPolicy=null;
    session=data.session;
    if(!session){state=null;available=empty();issue='';return;}
    const result=await Study.client.rpc('study_app_control',{p_action:'state',p_input:{}});
    if(ticket!==epoch)return;
    if(result.error||!result.data?.available)throw result.error||Error('Missing policy');
    state=result.data;available=state.available;issue='';
   }catch{
    if(ticket!==epoch)return;
    state=null;available=empty();issue='拡張機能の設定を確認できません。通信とログイン状態を確認してください。';
   }finally{
    if(ticket===epoch){verifiedEpoch=ticket;apply();resolveReady();}
   }
  })().finally(()=>pending=null);
  return pending;
 }
 let verifiedEpoch=-1;
 async function mutate(action,input={}){await ready;const{data,error}=await Study.client.rpc('study_app_control',{p_action:action,p_input:{revision:state?.revision??0,...input}});if(error)throw error;await refresh();return data;}
 async function requireApp(id){await ready;if(pending||verifiedEpoch!==epoch)await refresh();if(allowed(id))return true;show(id);return false;}
 function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s);});}
 async function boot(){try{for(let i=0;i<30&&!g.Study?.client;i++)await new Promise(r=>setTimeout(r,100));if(!g.Study?.client){if(!g.STUDY_CONFIG)await script(new URL('config.js',ROOT));if(!g.supabase)await script('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.102.0');if(!g.Study?.client)await script(new URL('study-client.js?v=20261110auth',ROOT));}if(!g.Study?.client)throw Error();Study.client.auth.onAuthStateChange(authChanged);await refresh();setInterval(()=>{if(!document.hidden)void refresh();},15000);}catch{issue='アカウント設定を読み込めません。通信を確認してください。';verifiedEpoch=epoch;apply();resolveReady();}}
 function onClick(e){const a=e.target.closest?.('a[href],#game-room-launch');if(!a)return;const id=a.id==='game-room-launch'?'games':route(a.href);if(id&&!allowed(id)){e.preventDefault();e.stopImmediatePropagation();if(verifiedEpoch!==epoch&&a.href){void requireApp(id).then(ok=>{if(ok)location.assign(a.href);});return;}show(id);}}
 function blockKeys(e){if(overlay&&route(location.href)&&!allowed(route(location.href))){if(!overlay.contains(e.target))e.preventDefault();e.stopImmediatePropagation();}}
 function bind(){document.addEventListener('click',onClick,true);document.addEventListener('keydown',blockKeys,true);document.addEventListener('keyup',blockKeys,true);}
 bind();
 g.addEventListener('message',e=>{if(e.origin!==ROOT.origin||e.source!==g.parent||g.parent===g||e.data?.type!=='study-app-policy')return;const p=e.data.policy;if(!session||e.data.userId!==account(session)||!p||manifest.some(x=>typeof p[x.id]!=='boolean'))return;parentPolicy=p;apply();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});g.addEventListener('storage',e=>{if(e.key?.startsWith('sb-')){epoch++;void refresh();}});
 g.StudyApps={ROOT,manifest,ready,refresh,mutate,allowed,require:requireApp,route,rebind:bind,get state(){return state;},get loggedIn(){return !!session;}};setTimeout(boot,0);
})(window);
