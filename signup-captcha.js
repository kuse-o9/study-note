'use strict';
(function(g){
 const root=new URL('.',document.currentScript.src);
 const config=(async()=>{const r=await fetch(new URL('signup-captcha.json',root),{cache:'no-cache',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('登録設定を読み込めません。');return (await r.json()).enabled===true;})();
 void config.catch(()=>{});
 const error=message=>Object.assign(Error(message),{code:'study_signup_challenge'});
 const field=document.getElementById('signup-captcha'),email=document.getElementById('signup-email'),question=document.getElementById('signup-captcha-question'),answer=document.getElementById('signup-captcha-answer'),status=document.getElementById('signup-captcha-status'),start=document.getElementById('signup-captcha-new');
 let current=null,epoch=0,loading=false;
 function clear(){epoch++;current=null;question.textContent='';answer.hidden=true;answer.value='';}
 void config.then(on=>{field.hidden=!on;}).catch(()=>{});
 email.addEventListener('input',()=>{clear();status.textContent='';});
 start.onclick=async()=>{
  if(!email.reportValidity()||loading)return;
  clear();const ticket=epoch,value=email.value.trim();loading=true;start.disabled=true;status.textContent='問題を準備しています…';
  try{
   const {data,error:failed}=await g.Study.client.rpc('study_signup_challenge',{p_email:value}).abortSignal(AbortSignal.timeout(8000));
   if(ticket!==epoch)return;
   if(failed||typeof data?.id!=='string'||!Number.isInteger(data.left)||!Number.isInteger(data.right))throw error('問題を読み込めませんでした。少し待ってからお試しください。');
   current={id:data.id,email:value};question.textContent=data.left+' ＋ '+data.right+' の答え';answer.hidden=false;answer.focus();status.textContent='３分以内に答えを入力して、登録を押してください。';
  }catch(e){if(ticket===epoch)status.textContent=e.message;}finally{loading=false;start.disabled=false;}
 };
 g.StudySignupCaptcha={async verify(client,value){
  if(!await config)return {};
  if(!current||current.email!==value||!/^\d{1,2}$/.test(answer.value.trim()))throw error('操作確認の問題を出して、答えを数字で入力してください。');
  const item=current,number=Number(answer.value);clear();status.textContent='確認しています…';
  const {data,error:failed}=await client.rpc('study_signup_answer',{p_id:item.id,p_email:value,p_answer:number}).abortSignal(AbortSignal.timeout(8000));
  if(failed||typeof data!=='string'){status.textContent='新しい問題を出してやり直してください。';throw error('答えが違うか、確認の有効期限が切れました。');}
  status.textContent='操作を確認しました。';return {study_signup_proof:data};
 }};
})(window);
