'use strict';
(()=>{
 const panel=document.getElementById('admin-counts'),status=document.getElementById('admin-count-status'),S=window.Study;
 if(!panel||!S?.client)return;
 let actor,epoch=0,busy=false;
 function clear(){epoch++;busy=false;panel.hidden=true;status.textContent='';for(const el of panel.querySelectorAll('[data-count]'))el.textContent='—';}
 async function load(){
  if(busy||document.hidden)return;busy=true;const ticket=epoch;
  try{
   const r=await S.client.rpc('study_admin_counts',{}).abortSignal(AbortSignal.timeout(9000));
   if(ticket!==epoch)return;
   if(r.error||!r.data){panel.hidden=true;return;}
   const d=r.data;for(const el of panel.querySelectorAll('[data-count]')){const k=el.dataset.count;const n=k==='requests'?(d.deletions===null?null:d.deletions+d.accounts):d[k];el.textContent=n===null?'オーナー専用':Number.isSafeInteger(n)?n+' 件':'—';}
   panel.hidden=false;status.textContent='';
  }catch{if(ticket===epoch&&!panel.hidden)status.textContent='件数を更新できませんでした。';}
  finally{if(ticket===epoch)busy=false;}
 }
 S.client.auth.onAuthStateChange((_,session)=>{const next=session?.user?.id??null;if(next===actor)return;actor=next;clear();if(next)setTimeout(()=>void load(),0);});
 window.addEventListener('study-admin-cleared',clear);
 window.addEventListener('study-access-status',e=>{if(e.detail?.allowed&&e.detail?.admin&&e.detail?.adminVerified)void load();else clear();});
 window.addEventListener('pageshow',()=>void load());document.addEventListener('visibilitychange',()=>void load());setInterval(load,30000);
 document.getElementById('admin-count-refresh').onclick=()=>void load();
 void load();
})();
