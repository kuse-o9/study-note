import assert from 'node:assert/strict';
import {airports,createFlight,step,world,local} from '../../game/flight/flight-model.mjs';
let total=0;
for(const a of airports)for(const b of airports)if(a!==b){
 const f=createFlight(a,b,true),phases=new Set();
 for(let i=0;i<40000&&!f.hit;i++){step(f,.025);phases.add(f.phase);}
 assert.deepEqual([...phases],['takeoff','cruise','final','rollout']);
 assert.equal(f.hit?.ok,true,a.id+' → '+b.id);
 const [cross,along]=local(b,f.x,f.z);
 assert(Math.abs(cross)<b.width/2&&along<=b.length&&f.speed<4);
 total++;
}
const [a,b]=airports;
assert.throws(()=>createFlight(a,a));
const manual=createFlight(a,b);
for(let i=0;i<3000&&!manual.airborne&&!manual.hit;i++)step(manual,.02,{throttle:1,pitch:manual.speed>=73?1:0});
assert(manual.airborne&&!manual.hit);
const noGear=createFlight(a,b);[noGear.x,noGear.z]=world(b,0,550);
Object.assign(noGear,{airborne:true,phase:'final',h:.02,vs:-3,speed:75,heading:b.heading,gear:false});
step(noGear,.025);
assert.equal(noGear.hit?.ok,false);
assert.match(noGear.hit.text,/脚/);
console.log('PASS '+total+' directed flights: takeoff, cruise, final, landing and stop; manual takeoff; same airport and gear-down checks');
