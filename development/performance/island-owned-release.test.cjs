'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),html=fs.readFileSync(path.resolve(__dirname,'../../game/index.html'),'utf8');
const source=html.split('\n').find(s=>s.includes('function releaseRetiredResources(roots)'));assert(source);const counts={g:0,m:0,t:0};const geometry=()=>({dispose(){counts.g++;}}),texture=()=>({isTexture:true,dispose(){counts.t++;}}),material=map=>({map,dispose(){counts.m++;}}),walk=nodes=>({traverse(fn){nodes.forEach(fn);}});
const liveGeometry=geometry(),goneGeometry=geometry(),sharedTexture=texture(),goneTexture=texture(),sharedMaterial=material(sharedTexture),paletteMaterial=material(null),goneMaterialA=material(sharedTexture),goneMaterialB=material(goneTexture);
const scene=walk([{geometry:liveGeometry,material:sharedMaterial}]),retired=walk([{geometry:goneGeometry,material:[paletteMaterial,goneMaterialA,goneMaterialB]},{geometry:goneGeometry,material:sharedMaterial},{geometry:liveGeometry,material:goneMaterialB}]);
const ctx={scene,mats:{paletteMaterial}};vm.runInNewContext(source,ctx);
for(let i=0;i<20;i++){ctx.releaseRetiredResources([retired,retired]);assert.deepEqual(counts,{g:i+1,m:(i+1)*2,t:i+1});}
assert(html.includes('releaseRetiredResources([...picked.roots,...(picked.cabin?[picked.cabin.interior.root]:[])]);'));
console.log('PASS 20 simulated unloads: release unique retired geometry, materials and textures once per unload; retain shared scene and palette resources. No physical VRAM claim.');
