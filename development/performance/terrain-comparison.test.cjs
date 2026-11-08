'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'../..'),after=fs.readFileSync(root+'/shared/rail-tunnel-runtime.js','utf8'),before=fs.readFileSync(root+'/development/performance/baseline/terrain6-runtime.js','utf8');
function run(source,mode){let allocations=0,frames=0,destroyed=0;let owned;const snapshots=[];
 class V{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}static add(a,b,o=new V()){return Object.assign(o,{x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});}static multiplyByScalar(a,s,o=new V()){return Object.assign(o,{x:a.x*s,y:a.y*s,z:a.z*s});}static distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}}
 class Collection{constructor(o){owned=this;allocations++;this.polygons=o.polygons||[];this.totalPositions=0;}destroy(){destroyed++;}static isSupported(){return true;}removeAll(){this.polygons=[];}add(p){this.polygons.push(p);return p;}}
 const C={Cartesian3:V,ClippingPolygonCollection:Collection,ClippingPolygon:class{constructor(o){this.positions=o.positions;this.length=o.positions.length;}},Color:{fromCssColorString:s=>s}},entities=new Set(),viewer={scene:{globe:{},screenSpaceCameraController:{},requestRender(){}},entities:{add:e=>(entities.add(e),e),remove:e=>entities.delete(e)}};
 const ctx=vm.createContext({URLSearchParams,location:{search:mode===undefined?'':'?railGpuTest='+mode},RailCore:{position:(g,d)=>({height:Math.cos(d/800)*3})}});vm.runInContext(source,ctx);
 const gs=Object.fromEntries(['up','down'].map((key,i)=>[key,{side:i*24,cumulative:Array.from({length:401},(_,i)=>i*100),route:{trackOffsets:Array.from({length:401},(_,i)=>i>=20&&i<=350?-20:5)}}]));
 const frame=(g,d)=>{frames++;return {center:new V(d,Math.sin(d/1000)*30+g.side,Math.cos(d/800)*3),left:new V(0,1,0),up:new V(0,0,1)};};
 ctx.BaylineTunnels.setup(viewer,C,gs,frame);
 for(const distance of [0,1600,1980,...Array.from({length:30},(_,i)=>4000+i*121),34800,35100,36000]){
  ctx.BaylineTunnels.render({direction:'up',distance});const collection=owned;
  snapshots.push({polygons:[...new Set(collection.polygons.map(p=>JSON.stringify(p.positions)))].sort(),entities:[...entities].map(e=>JSON.stringify(e)).sort()});
  collection.totalPositions=collection.polygons.reduce((n,p)=>n+p.length,0);
 }
 const attached=!!viewer.scene.globe.clippingPolygons;const profile=ctx.BaylineTunnels.diagnosticMode;ctx.BaylineTunnels.dispose();return{snapshots,allocations,frames,attached,profile,destroyed,remainingEntities:entities.size};
}
const normal=run(after),explicit=run(after,'normal'),noClipping=run(after,'no-clipping'),noEntities=run(after,'no-terrain-entities'),unknown=run(after,'other');
assert.deepStrictEqual(normal.snapshots,explicit.snapshots);assert.deepStrictEqual(normal.snapshots,unknown.snapshots);assert.equal(unknown.profile,'normal');assert.equal(noClipping.attached,false);assert.equal(normal.attached,true);assert.equal(noClipping.destroyed,1);assert.equal(noClipping.remainingEntities,0);
for(let i=0;i<normal.snapshots.length;i++){assert.deepStrictEqual(noClipping.snapshots[i].entities,normal.snapshots[i].entities);assert.deepStrictEqual(noEntities.snapshots[i].polygons,normal.snapshots[i].polygons);assert.equal(noEntities.snapshots[i].entities.length,0);}
assert.equal(noEntities.attached,true);console.log('PASS: 36 windows; default/explicit normal and unknown mode unchanged; clipping GPU attachment and terrain entities independently isolated; detached collection disposed; no physical GPU claim.');
