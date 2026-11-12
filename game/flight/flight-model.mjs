const R=Math.PI/180;
export const airports=[
 {id:'HND',name:'東京・羽田',lat:35.55,lon:139.78,heading:330,runway:'34L',length:3000,width:60,shore:true},
 {id:'NRT',name:'成田',lat:35.77,lon:140.39,heading:334,runway:'34L',length:4000,width:60,shore:false},
 {id:'KIX',name:'関西',lat:34.43,lon:135.23,heading:60,runway:'06R',length:3500,width:60,shore:true}
].map(a=>({...a,x:(a.lon-139.78)*18000,z:(a.lat-35.55)*22300}));
export const wrap=a=>(a%360+360)%360, delta=(a,b)=>wrap(a-b+180)-180;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const bearing=(x,z)=>wrap(Math.atan2(x,z)/R);
export function world(a,x,z){const r=a.heading*R,c=Math.cos(r),s=Math.sin(r);return [a.x+x*c+z*s,a.z-x*s+z*c];}
export function local(a,x,z){const r=a.heading*R,c=Math.cos(r),s=Math.sin(r);return [(x-a.x)*c-(z-a.z)*s,(x-a.x)*s+(z-a.z)*c];}
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function createFlight(from,to,assist=false){
 if(!from||!to||from===to)throw Error('出発地と到着地を別々に選んでください。');
 const [x,z]=world(from,0,28);
 return {from,to,assist,x,z,h:0,speed:0,vs:0,heading:from.heading,pitch:0,bank:0,throttle:0,gear:true,flaps:true,airborne:false,phase:'takeoff',t:0,brake:false,hit:null};
}
export function guidance(f){
 const [cross,along]=local(f.to,f.x,f.z), d=distance(f,f.to);
 if(f.phase==='takeoff')return {heading:f.from.heading,alt:600,speed:115,label:'離陸'};
 if(f.phase==='rollout')return {heading:f.to.heading,alt:0,speed:0,label:'着陸・減速'};
 if(f.phase==='final')return {heading:wrap(f.to.heading-clamp(cross/27,-25,25)),alt:Math.max(0,(-along+170)*.047),speed:along<-650?83:72,label:'最終進入'};
 const [x,z]=world(f.to,0,-7200);
 const approachDistance=Math.hypot(f.x-x,f.z-z);
 return {heading:bearing(x-f.x,z-f.z),alt:clamp(350+(approachDistance-1200)*.13,350,1850),speed:approachDistance<9000?115:208,label:d<18000?'進入地点へ':'巡航',approachDistance};
}
export function step(f,dt,input={}){
 if(f.hit||dt<=0)return;
 dt=Math.min(dt,.06);f.t+=dt;
 const [cx,cz]=local(f.to,f.x,f.z);
 const nearEntry=cz<-1300&&cz>-9500&&Math.abs(cx)<1700&&Math.abs(delta(f.heading,f.to.heading))<50;
 if(f.phase==='takeoff'&&f.h>165)f.phase='cruise';
 if(f.phase==='cruise'&&(nearEntry||guidance(f).approachDistance<640))f.phase='final';
 if(f.phase==='final'&&cz>f.to.length+900&&f.h>0)f.phase='cruise';
 const g=guidance(f);
 let targetPitch=0, turn=input.turn||0, braking=f.brake||input.brake;
 if(f.assist){
  f.gear=f.phase!=='cruise'||f.h<240;
  f.flaps=f.phase!=='cruise'||g.approachDistance<6500;
  turn=clamp(delta(g.heading,f.heading)/16,-1,1);
  const groundTakeoff=f.phase==='takeoff'&&!f.airborne;
  targetPitch=groundTakeoff?(f.speed>=73?12:0):clamp((g.alt-f.h)*.11-(f.vs*.32),-12,14);
  if(f.phase==='final'&&f.h<12&&cz>0)targetPitch=0;
  braking=f.phase==='rollout';
  f.throttle=braking?0:groundTakeoff?1:clamp(.31+(g.speed-f.speed)*.036,0,1);
 }else{
  f.throttle=clamp(f.throttle+(input.throttle||0)*dt*.38,0,1);
  targetPitch=(input.pitch||0)*15;
 }
 f.bank+=(turn*30-f.bank)*Math.min(dt*2.1,1);
 f.heading=wrap(f.heading+turn*dt*(f.airborne?7.0:12));
 f.pitch+=(targetPitch-f.pitch)*Math.min(dt*2,1);
 const drag=.13+f.speed*f.speed*(f.flaps?.000067:.000039)+(f.gear?.16:0)+(f.airborne?0:.24);
 f.speed=clamp(f.speed+(f.throttle*3.2-drag-(braking&&!f.airborne?5.6:0)-Math.max(0,f.pitch)*.018)*dt,0,248);
 const stall=f.flaps?59:69;
 if(!f.airborne&&f.phase==='takeoff'&&f.speed>stall+4&&f.pitch>5)f.airborne=true;
 if(f.airborne){
  const desired=f.speed*Math.sin(f.pitch*R)*.73-Math.max(0,stall-f.speed)*.36-1.25;
  f.vs+=(desired-f.vs)*Math.min(dt*1.5,1);
  f.h=clamp(f.h+f.vs*dt,-20,11500);
 }
 f.x+=Math.sin(f.heading*R)*f.speed*dt;f.z+=Math.cos(f.heading*R)*f.speed*dt;
 if(f.airborne&&f.h<=0&&f.vs<0){
  const [side,pos]=local(f.to,f.x,f.z);
  if(f.gear&&Math.abs(side)<f.to.width/2&&pos>=0&&pos<=f.to.length&&Math.abs(delta(f.heading,f.to.heading))<18&&f.speed<107&&f.vs>-9){
   f.touchdown={vs:f.vs,speed:f.speed,side};f.airborne=false;f.phase='rollout';f.h=0;f.vs=0;f.pitch=0;
  }else f.hit={ok:false,text:!f.gear?'脚が出ていませんでした。':pos<0?'滑走路の手前で接地しました。':'滑走路の中央に合わせ、速度と降下率を落として再挑戦しよう。'};
 }
 if(!f.airborne&&f.phase==='takeoff'){
  const [side,pos]=local(f.from,f.x,f.z);
  if(Math.abs(side)>f.from.width*.5||pos>f.from.length)f.hit={ok:false,text:'滑走路を外れました。中央線を保って加速しよう。'};
 }
 if(f.phase==='rollout'){
  const [side,pos]=local(f.to,f.x,f.z);
  if(Math.abs(side)>f.to.width*.5||pos>f.to.length)f.hit={ok:false,text:'停止前に滑走路を外れました。接地後はブレーキを使おう。'};
  else if(f.speed<4)f.hit={ok:true,text:'到着しました。滑走路上で停止できました。'};
 }
}
