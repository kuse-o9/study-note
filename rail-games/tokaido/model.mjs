export const km=[0,1.9,6.8,18.2,28.8,40.9,46.5,51.1,54.8,58.6,63.8,67.8,73.1,77.7,80.8,83.9,86,90.4,95.8,99.1,104.6];
const cap=(v,a,b)=>Math.min(b,Math.max(a,v));
export function create(stations,reverse,start,auto){
 const all=stations.map((s,i)=>({...s,at:km[i]*260}));if(reverse){all.reverse();for(const x of all)x.at=km.at(-1)*260-x.at;}
 return {all,reverse,pos:all[start].at,speed:0,next:start,served:[start],door:true,auto,dwell:0,power:0,complete:false,passed:false,events:[]};
}
export function limit(s){const i=Math.max(0,s.next-1);return (s.reverse?20-i:i)>=16?95:110;}
export function doors(s){
 if(s.complete||s.speed>.05)return false;
 if(s.door){if(s.next>=s.all.length-1){s.complete=true;return true;}s.door=false;s.next++;s.dwell=0;return true;}
 const t=s.all[s.next];if(Math.abs(s.pos-t.at)>5)return false;
 s.pos=t.at;s.speed=0;s.door=true;s.dwell=0;s.served.push(s.next);s.events.push({name:t.name,error:0});return true;
}
export function step(s,dt){
 if(s.complete||dt<=0)return;dt=Math.min(dt,.05);
 if(s.door){s.dwell+=dt;if(s.auto&&s.dwell>=3)doors(s);return;}
 const target=s.all[s.next].at,remaining=target-s.pos;
 const ceiling=limit(s)/3.6;
 if(s.auto&&remaining<=.6&&s.speed<1.6){s.pos=target;s.speed=0;doors(s);return;}
 const desired=Math.min(ceiling,Math.sqrt(Math.max(0,2*.82*(remaining-.22))));
 const acc=s.auto?cap((desired-s.speed)*1.4,-1.3,.92):s.power>0?.31*s.power:s.power<0?.28*s.power:-.035;
 s.speed=cap(s.speed+acc*dt,0,ceiling+8);
 s.pos+=s.speed*dt;
 if(s.pos>target+5){s.passed=true;s.speed=0;s.complete=true;}
}
