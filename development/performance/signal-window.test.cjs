'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),a=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'), source=p=>fs.readFileSync(path.join(root,p),'utf8');
const variants=['shared/rail-signal-runtime.js','shared/rail-scene-shared.js','rail-games/priority/batch-001/games/shared.js'];
let comparisons=0;
for(const path of variants){
 const c=vm.createContext({});
 vm.runInContext(source('shared/rail-signals.js'),c);
 const text=source(path),start=text.indexOf('/* Common game signalling.'),end=text.indexOf("})(typeof globalThis",start);
 a(start>=0&&end>start);
 const tail=text.indexOf('\n',end);vm.runInContext(text.slice(start,tail===-1?undefined:tail),c);
 let visits=0;
 c.BaylineJunctions={allowed:(_,__,i)=>{visits++;return i%127!==101;},blockedInside:(_,__,t)=>t.id==='hold'};
 const R=c.BaylineSignalRuntime,S=c.BaylineSignals;
 function brute(geo,traffic,train,player){
  const {blocks,loop}=R.layout(geo),d=train.distance;let next=null,stop=train.id==='hold'?0:Infinity;
  for(let i=0;i<blocks.length;i++){
   let ahead=blocks[i].start-d;
   if(loop)ahead=(ahead%geo.length+geo.length)%geo.length;
   if(ahead<-.05)continue;
   const color=R.aspect(geo,i,traffic,player,train.id||'player');
   if(!next||ahead<next.distance)next={index:i,distance:Math.max(0,ahead),aspect:color};
   if(color==='RED')stop=Math.min(stop,Math.max(0,ahead-5));
  }
  const gap=R.clearance(geo,traffic,train,player);
  return {next,stopDistance:Math.min(stop,Math.max(0,gap-45)),limit:next?.aspect==='YELLOW'&&next.distance<800?45:Infinity};
 }
 for(const loop of [false,true]){
  const geo={key:'up',length:loop?35501:300111,route:{loop,stops:[{distance:700},{distance:4300},{distance:11200}],signalRoutes:{3:{switchAligned:false}}}};
  const traffic={trains:[{id:'lead',direction:'up',distance:16400,length:170},{id:'rear',direction:'up',distance:20,length:110}],reservations:[]};
  const {blocks}=R.layout(geo);
  for(const d of [-.1,0,20,blocks[3].start+.049,blocks[3].start+.051,geo.length-2,geo.length,geo.length+1,...Array.from({length:83},(_,i)=>geo.length*i/83)]){
   const t={id:d===0?'hold':'self',direction:'up',distance:d,length:220};
   const expected=brute(geo,traffic,t,null);
   a.deepEqual({...R.control(geo,traffic,t,null),next:JSON.parse(JSON.stringify(R.control(geo,traffic,t,null).next))},expected);
   comparisons++;
  }
 }
 const geo={key:'up',length:300000,route:{stops:[]}},t={id:'self',direction:'up',distance:0,length:220};
 const traffic={trains:[{id:'lead',direction:'up',distance:760,length:120}],reservations:[]};
 visits=0;R.control(geo,traffic,t,null);a.equal(visits,2,'only inspect through the first red signal');
}
console.log('PASS '+comparisons+' signal equivalence cases; 500-block test evaluates 2 aspects before the first red');
