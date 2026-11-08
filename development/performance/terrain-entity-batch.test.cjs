'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const Real=require(process.env.CESIUM_RUNTIME||path.resolve(__dirname,'../../../work/cesium-runtime/node_modules/cesium'));
const root=path.resolve(__dirname,'../..'),after=fs.readFileSync(root+'/shared/rail-tunnel-runtime.js','utf8'),before=fs.readFileSync(root+'/development/performance/baseline/terrain6-runtime.js','utf8');
function run(source){let allocations=0,frames=0,notifications=0,nextId=0;const native=new Real.EntityCollection(),ids=new Map();native.collectionChanged.addEventListener(()=>notifications++);const snapshots=[];
 class V{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}static add(a,b,o=new V()){return Object.assign(o,{x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});}static multiplyByScalar(a,s,o=new V()){return Object.assign(o,{x:a.x*s,y:a.y*s,z:a.z*s});}static distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}}
 class Collection{constructor(o){allocations++;this.polygons=o.polygons||[];this.totalPositions=0;}static isSupported(){return true;}removeAll(){this.polygons=[];}add(p){this.polygons.push(p);return p;}}
 const C={Cartesian3:V,ClippingPolygonCollection:Collection,ClippingPolygon:class{constructor(o){this.positions=o.positions;this.length=o.positions.length;}},Color:{fromCssColorString:s=>s}},entities=new Set(),viewer={scene:{globe:{},screenSpaceCameraController:{},requestRender(){}},entities:{suspendEvents:()=>native.suspendEvents(),resumeEvents:()=>native.resumeEvents(),add(e){const id=String(nextId++);ids.set(e,id);native.add({id});entities.add(e);return e;},remove(e){native.removeById(ids.get(e));ids.delete(e);return entities.delete(e);}}};
 const ctx=vm.createContext({RailCore:{position:(g,d)=>({height:Math.cos(d/800)*3})}});vm.runInContext(source,ctx);
 const gs=Object.fromEntries(['up','down'].map((key,i)=>[key,{side:i*24,cumulative:Array.from({length:401},(_,i)=>i*100),route:{trackOffsets:Array.from({length:401},(_,i)=>i>=20&&i<=350?-20:5)}}]));
 const frame=(g,d)=>{frames++;return {center:new V(d,Math.sin(d/1000)*30+g.side,Math.cos(d/800)*3),left:new V(0,1,0),up:new V(0,0,1)};};
 ctx.BaylineTunnels.setup(viewer,C,gs,frame);
 for(const distance of [0,1600,1980,...Array.from({length:30},(_,i)=>4000+i*121),34800,35100,36000]){
  ctx.BaylineTunnels.render({direction:'up',distance});const collection=viewer.scene.globe.clippingPolygons;
  snapshots.push({polygons:[...new Set(collection.polygons.map(p=>JSON.stringify(p.positions)))].sort(),entities:[...entities].map(e=>JSON.stringify(e)).sort()});
  collection.totalPositions=collection.polygons.reduce((n,p)=>n+p.length,0);
 }
 assert.equal(native._suspendCount,0);return{snapshots,allocations,frames,notifications};
}
const a=run(before),b=run(after);assert.deepStrictEqual(b.snapshots,a.snapshots,'Every mask, floor, wall, roof, light and color is retained');assert(b.notifications<=b.snapshots.length);assert(b.notifications<a.notifications/10);console.log(JSON.stringify({pass:true,cesium:Real.VERSION,windows:b.snapshots.length,identicalMaskUnionAndEntities:true,notifications:{before:a.notifications,after:b.notifications},noPhysicalGpuClaim:true}));

// An exception must not leave notifications suspended; respect an outer batch.
{const entities=new Real.EntityCollection();entities.suspendEvents();const wrapper=after.slice(after.indexOf('function render(player){'),after.indexOf('function renderWindow(player){'));const c=vm.createContext({active:{viewer:{entities}},renderWindow(){throw Error('test');}});vm.runInContext(wrapper,c);assert.throws(()=>c.render({}),/test/);assert.equal(entities._suspendCount,1);entities.resumeEvents();assert.equal(entities._suspendCount,0);console.log('PASS: exception cleanup and nested EntityCollection batching retained');}
