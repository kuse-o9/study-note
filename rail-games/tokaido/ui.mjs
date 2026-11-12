import {create,step,limit,doors} from './model.mjs';
const $=id=>document.getElementById(id),canvas=$('view'),c=canvas.getContext('2d',{alpha:false}),W=canvas.width,H=canvas.height;
const data=await fetch('stations.json').then(r=>{if(!r.ok)throw Error('駅データを読み込めません');return r.json();}).catch(()=>null);
let s=null,frame=0,last=0,hudAt=0,authorized=false,task;
const paint=(color,pts)=>{c.fillStyle=color;c.beginPath();c.moveTo(...pts[0]);for(const p of pts.slice(1))c.lineTo(...p);c.closePath();c.fill();};
function draw(){
 const d=s.pos,sea=(s.reverse?s.all.at(-1).at-d:d)>21800,station=s.all[s.next];
 const sky=c.createLinearGradient(0,0,0,210);sky.addColorStop(0,'#437b9a');sky.addColorStop(1,'#c1dee0');c.fillStyle=sky;c.fillRect(0,0,W,205);
 c.fillStyle=sea?'#5196a2':'#768e79';c.fillRect(0,205,W,H-205);
 for(let i=0;i<16;i++){const x=i*72-30,y=195-Math.sin(i*2.7)*12;paint(sea?'#648c8c':'#526d68',[[x,213],[x+42,y-13],[x+105,213]]);}
 const P=(x,z,h=0)=>[W/2+x*430/(z+20)+Math.sin((d+z)*.0017)*Math.min(125,z*.31),197+(5.5-h)*475/(z+20)];
 for(let i=29;i>=0;i--){const z=i*19-d%19,far=z+19,near=Math.max(0,z);if(far<=0)continue;
  paint(i%2?'#5d6263':'#646968',[P(-4.7,far),P(4.7,far),P(4.7,near),P(-4.7,near)]);
  for(const x of [-3.7,-2.24,-.72,.72]){
   paint('#bdc8ca',[P(x-.037,far),P(x+.037,far),P(x+.037,near),P(x-.037,near)]);
  }
  for(let j=0;j<5;j++){const a=z+j*3.8;if(a<0)continue;for(const x of [-3,-.0])paint('#3f4244',[P(x-1.04,a+.2),P(x+1.04,a+.2),P(x+1.04,a),P(x-1.04,a)]);}
  if(i%3===0){const x=sea?-8:8,side=x>0?1:-1,h=sea?3:8+((i*7+Math.floor(d/57))%8);
   paint(sea?'#788877':'#7b8f95',[P(x,near),P(x+side*4,near),P(x+side*4,near,h),P(x,near,h)]);
  }
 }
 const rem=station.at-d;
 if(rem<220&&rem>-14){const far=Math.max(13,rem+50),near=Math.max(0,rem-55);
  paint('#a9ad9e',[P(1.8,far,1),P(6.5,far,1),P(6.5,near,1),P(1.8,near,1)]);
  paint('#f3d477',[P(1.82,far,1.02),P(2.07,far,1.02),P(2.07,near,1.02),P(1.82,near,1.02)]);
  const [x,y]=P(3.5,Math.max(10,rem+14),3);
  c.fillStyle='#15382e';c.fillRect(x-42,y-14,84,24);c.fillStyle='#fff';c.textAlign='center';c.font='bold 14px system-ui';c.fillText(station.name,x,y+3);
 }
 paint('#142732',[[0,0],[W*.075,0],[W*.04,H*.81],[W*.13,H*.89],[W*.87,H*.89],[W*.96,H*.81],[W*.925,0],[W,0],[W,H],[0,H]]);
 c.fillStyle='#a1e8c6';c.textAlign='center';c.font='bold 14px system-ui';c.fillText('BAYLINE  /  JT',W/2,H*.962);
}
function pick(){if(!data)return;const a=$('direction').value==='up'?[...data.stations].reverse():data.stations;$('origin').replaceChildren(...a.slice(0,-1).map((x,i)=>new Option(x.name,i)));}
$('direction').onchange=pick;pick();
function stop(){cancelAnimationFrame(frame);frame=0;last=0;$('pause').textContent='再開';}
function hud(){const t=s.all[s.next];$('speed').textContent=(s.speed*3.6).toFixed(1)+' km/h';$('next').textContent=t.name;$('distance').textContent=Math.round(t.at-s.pos)+' m';$('limit').textContent=limit(s)+' km/h';
 const message=s.passed?'停止位置を通過しました。設定から再挑戦できます。':s.complete?'終点に到着しました。':s.door?'ドア開 ／ 停車中':s.auto?'自動運転中':'ノッチ '+s.power+' ／ ドア閉';if($('message').textContent!==message)$('message').textContent=message;
 if(Number($('stops').dataset.at)!==s.next||!$('stops').children.length){$('stops').dataset.at=s.next;for(const [i,li]of [...$('stops').children].entries())li.classList.toggle('current',i===s.next);$('stops').children[s.next]?.scrollIntoView({block:'nearest',inline:'nearest'});}
}
function tick(now){frame=0;if(!s||!authorized)return;const dt=last?Math.min(.09,(now-last)/1000):0;last=now;for(let i=0;i<Number($('rate').value)*3;i++)step(s,dt/3);draw();if(now-hudAt>110||s.complete){hudAt=now;hud();}if(!s.complete)frame=requestAnimationFrame(tick);}
function resume(){if(!authorized||!s||s.complete||frame)return;$('pause').textContent='一時停止';frame=requestAnimationFrame(tick);}
$('pause').onclick=()=>frame?stop():resume();$('back').onclick=()=>{stop();s=null;$('cab').hidden=true;$('plan').hidden=false;$('start').focus();};
function notch(change){if(!authorized||!s||s.auto||s.door||s.complete)return;s.power=Math.min(3,Math.max(-5,s.power+change));hud();}
function open(){if(authorized&&s&&!s.auto){doors(s);hud();draw();}}
$('brake').onclick=()=>notch(-1);$('power').onclick=()=>notch(1);$('door').onclick=open;
window.addEventListener('keydown',e=>{if(!s||e.repeat||e.target.matches('button,input,select,textarea,a'))return;if(['ArrowLeft','ArrowRight','KeyD'].includes(e.code)){e.preventDefault();if(e.code==='KeyD')open();else notch(e.code==='ArrowLeft'?-1:1);}});
async function access(){if(task)return task;task=(async()=>{try{await StudyApps.ready;const catalog=await GamePublication.load();authorized=StudyApps.allowed('games')&&catalog.items.some(x=>x.id==='tokaido-local'&&x.published);}catch{authorized=false;}finally{$('start').disabled=!authorized||!data;$('access').textContent=!data?'駅データを読み込めません。':authorized?'':'ゲームの利用設定を確認してください。';if(!authorized)stop();}return authorized;})().finally(()=>task=null);return task;}
GamePublication.registerPause(()=>{authorized=false;$('start').disabled=true;stop();});window.addEventListener('study-app-policy',e=>{if(!e.detail.games){authorized=false;$('start').disabled=true;stop();}else if(!authorized)void access();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
$('plan').onsubmit=async e=>{e.preventDefault();if(!data||s||!await access())return;s=create(data.stations,$('direction').value==='up',Number($('origin').value),$('mode').value==='auto');$('stops').replaceChildren(...s.all.map(t=>{const li=document.createElement('li');li.textContent=t.name;return li;}));$('plan').hidden=true;$('cab').hidden=false;hud();draw();resume();};
void access();
