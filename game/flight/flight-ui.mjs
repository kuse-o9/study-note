import {airports,createFlight,step,guidance,distance,world} from './flight-model.mjs';
import {makeView} from './flight-view.mjs';
const $=id=>document.getElementById(id),find=id=>airports.find(a=>a.id===id),keys=new Set(),touch=new Map();
const from=$('from'),to=$('to'),screen=$('flight'),start=$('launch'),canvas=$('view'),map=$('map'),ctx=map.getContext('2d');
let flight=null,view=null,paused=false,ready=false,last=0,frame=0,lastHud=0;
for(const select of [from,to])for(const a of airports){const opt=document.createElement('option');opt.value=a.id;opt.textContent=a.name+'（'+a.id+'）';select.append(opt);}
from.value='HND';to.value='NRT';
function route(){
 const a=find(from.value),b=find(to.value),same=a===b;
 start.disabled=!ready||same;
 $('route').textContent=same?'出発空港と到着空港を別々に選んでください。':a.id+' / RWY '+a.runway+' → '+b.id+' / RWY '+b.runway+'　｜　各方向を選べます';
}
from.onchange=to.onchange=route;$('swap').onclick=()=>{[from.value,to.value]=[to.value,from.value];route();};
route();
function setPaused(value){paused=value;keys.clear();touch.clear();last=0;$('pause').textContent=value?'再開':'一時停止';if(!value&&flight&&!frame)frame=requestAnimationFrame(tick);else if(value&&frame){cancelAnimationFrame(frame);frame=0;}if(flight)hud();}
function toggleAssist(){if(!flight||flight.hit)return;flight.assist=!flight.assist;hud();}
function gear(){if(flight&&!flight.hit&&!flight.assist&&flight.airborne)flight.gear=!flight.gear;if(flight)hud();}
function flaps(){if(flight&&!flight.hit&&!flight.assist)flight.flaps=!flight.flaps;if(flight)hud();}
$('gear').onclick=gear;$('flaps').onclick=flaps;$('auto').onclick=toggleAssist;
$('pause').onclick=()=>{if(flight&&!flight.hit)setPaused(!paused);};
$('reset').onclick=()=>{setPaused(true);flight=null;screen.hidden=true;document.querySelector('.brief').hidden=false;start.focus();};
function value(id,txt){const el=$(id);if(el.textContent!==txt)el.textContent=txt;}
const heading=n=>String(Math.round(n)%360).padStart(3,'0')+'°';
function hud(){
 const f=flight;if(!f)return;
 const g=guidance(f),kt=Math.round(f.speed*1.94384),ft=Math.round(f.h*3.28084);
 value('speed',kt+' kt');value('alt',Math.max(0,ft)+' ft');value('heading',heading(f.heading));value('power',Math.round(f.throttle*100)+'%');
 value('config',(f.gear?'脚↓':'脚↑')+'・'+(f.flaps?'展開':'格納'));value('stage',paused&&!f.hit?'一時停止':f.hit?(f.hit.ok?'到着':'再挑戦'):g.label);
 $('auto').setAttribute('aria-pressed',String(f.assist));value('auto','操縦アシスト：'+(f.assist?'ON':'OFF'));
 value('target',f.to.name+'まで '+(distance(f,f.to)/1000).toFixed(1)+' km（ゲーム内）　目安 '+heading(g.heading)+' / '+Math.round(g.alt*3.28084)+' ft');
 drawMap(f);
}
function drawMap(f){
 const w=map.width,h=map.height,origin=f.from,dest=f.to;
 const points=[origin,dest],left=Math.min(...points.map(p=>p.x),f.x)-2800,right=Math.max(...points.map(p=>p.x),f.x)+2800,bottom=Math.min(...points.map(p=>p.z),f.z)-2800,top=Math.max(...points.map(p=>p.z),f.z)+2800;
 const s=Math.min((w-34)/(right-left),(h-30)/(top-bottom));
 const p=(x,z)=>[w*.5+(x-(left+right)*.5)*s,h*.5-(z-(top+bottom)*.5)*s];
 ctx.fillStyle='#0d1d2d';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#253e54';ctx.lineWidth=1;ctx.beginPath();for(let x=10;x<w;x+=20){ctx.moveTo(x,0);ctx.lineTo(x,h);}for(let y=10;y<h;y+=20){ctx.moveTo(0,y);ctx.lineTo(w,y);}ctx.stroke();
 ctx.setLineDash([4,4]);ctx.strokeStyle='#64bacb';ctx.beginPath();ctx.moveTo(...p(origin.x,origin.z));ctx.lineTo(...p(dest.x,dest.z));ctx.stroke();ctx.setLineDash([]);
 ctx.font='bold 12px system-ui';for(const a of points){const [x,y]=p(a.x,a.z);ctx.fillStyle='#d5f4ff';ctx.fillRect(x-2,y-2,4,4);ctx.fillText(a.id,x>w-42?x-31:x+6,y-7);}
 const [x,y]=p(f.x,f.z);ctx.save();ctx.translate(x,y);ctx.rotate(f.heading*Math.PI/180);ctx.fillStyle='#ffe287';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(0,2);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
}
function held(code){return keys.has(code)||[...touch.values()].includes(code);}
function tick(now){
 frame=0;if(!flight||paused)return;
 const elapsed=last?Math.min((now-last)/1000,.09):0;last=now;
 const input={turn:Number(held('ArrowRight'))-Number(held('ArrowLeft')),pitch:Number(held('ArrowDown'))-Number(held('ArrowUp')),throttle:Number(held('KeyW'))-Number(held('KeyS')),brake:held('Space')};
 const rate=Number($('rate').value)||1;
 for(let i=0;i<rate*3;i++)step(flight,elapsed/3,input);
 view.draw(flight);
 if(now-lastHud>130||flight.hit){lastHud=now;hud();}
 if(flight.hit){
  const result=$('result');result.hidden=false;result.dataset.ok=String(flight.hit.ok);result.textContent=flight.hit.text+(flight.touchdown&&flight.hit.ok?' 接地速度 '+Math.round(flight.touchdown.speed*1.94384)+' kt。':'');return;
 }
 frame=requestAnimationFrame(tick);
}
const controls=new Set(['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','KeyW','KeyS','KeyG','KeyF','Space','KeyP']);
window.addEventListener('keydown',e=>{
 if(!flight||!controls.has(e.code)||/^(BUTTON|SELECT|INPUT|TEXTAREA|A)$/.test(e.target?.tagName))return;
 e.preventDefault();keys.add(e.code);
 if(!e.repeat){if(e.code==='KeyG')gear();if(e.code==='KeyF')flaps();if(e.code==='KeyP'&&!flight.hit)setPaused(!paused);}
});
window.addEventListener('keyup',e=>keys.delete(e.code));
for(const b of document.querySelectorAll('[data-key]')){
 b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);touch.set(e.pointerId,b.dataset.key);});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,e=>touch.delete(e.pointerId));
 b.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter')keys.add(b.dataset.key);});
 b.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter')keys.delete(b.dataset.key);});
 b.addEventListener('blur',()=>keys.delete(b.dataset.key));
}
const pause=()=>{if(flight&&!flight.hit)setPaused(true);};
window.addEventListener('blur',()=>{keys.clear();touch.clear();});window.addEventListener('pagehide',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('study-app-policy',e=>{if(!e.detail.games){ready=false;route();pause();}else if(!ready)void check();});
window.addEventListener('study-access-status',e=>{if(!e.detail?.allowed)pause();});
window.GamePublication?.registerPause(pause);
let checking=null;
function check(){
 if(checking)return checking;
 checking=(async()=>{
  const apps=window.StudyApps,pub=window.GamePublication;
  if(!apps||!pub){$('access').textContent='利用設定を読み込めません。ページを再読み込みしてください。';return false;}
  await apps.ready;if(!apps.allowed('games'))return false;
  try{const data=await pub.load();ready=apps.allowed('games')&&data.items.some(i=>i.id==='flight-deck'&&i.published);$('access').textContent=ready?'':'現在このゲームは利用できません。';route();return ready;}
  catch{$('access').textContent='公開設定を確認できませんでした。ページを再読み込みしてください。';return false;}
 })().finally(()=>checking=null);
 return checking;
}
$('plan').onsubmit=async e=>{
 e.preventDefault();if(flight||from.value===to.value||!await check())return;
 if(!view)view=makeView(canvas,airports);
 flight=createFlight(find(from.value),find(to.value),$('assist').checked);$('result').hidden=true;document.querySelector('.brief').hidden=true;screen.hidden=false;
 $('flight-title').focus();hud();view.draw(flight);setPaused(false);
};
void check();
