'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'shared/rail-asset-store.js'),'utf8');
(async()=>{
 let fetchMode='ok',aborted=0;
 const ctx={AbortController,setTimeout,clearTimeout,fetch:async(url,{signal})=>{if(fetchMode==='http')return{ok:false,status:503};return{ok:true,json:()=>fetchMode==='hang'?new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted++;reject(Error('aborted'));},{once:true});}):Promise.resolve({models:[{id:url}]})};}};
 vm.runInNewContext(source,ctx);const create=ctx.BaylineAssetStore.create;
 const store=create({maxBytes:4096});const original={models:[{id:'same',groups:[{positions:'abcdef',indices:'xyz'}]}]};store.set('original',original);assert.equal(store.get('original'),original,'no copying or reducing visible model data');
 for(let i=0;i<100;i++)store.set(i,{data:'x'.repeat(600)});assert(store.getStats().bytes<=4096);assert(store.getStats().evictions>0);assert.equal(store.has('original'),false);
 const large={data:'x'.repeat(10000)};store.set('oversize',large);assert.equal(store.has('oversize'),false);assert.equal(large.data.length,10000,'oversized data remains usable by its caller');store.clear();assert.equal(store.getStats().bytes,0);
 let active=0,peak=0;const queue=create({concurrency:2});const jobs=Array.from({length:12},(_,i)=>queue.run(async()=>{active++;peak=Math.max(peak,active);try{await new Promise(r=>setTimeout(r,2));if(i===3)throw Error('expected');return i;}finally{active--;}}));const results=await Promise.allSettled(jobs);await new Promise(r=>setTimeout(r,0));assert.equal(peak,2);assert.equal(results.filter(r=>r.status==='fulfilled').length,11);assert.equal(queue.getStats().active,0);assert.equal(queue.getStats().queued,0);
 const net=create({timeoutMs:10});assert.deepEqual(JSON.parse(JSON.stringify(await net.fetchJSON('ok'))),{models:[{id:'ok'}]});fetchMode='http';await assert.rejects(net.fetchJSON('bad'),/503/);fetchMode='hang';await assert.rejects(net.fetchJSON('stalled'),/時間内/);assert.equal(aborted,1);fetchMode='ok';assert.equal((await net.fetchJSON('retry')).models[0].id,'retry');
 for(const route of ['chuo','chuo-local','keihin','sobu']){const html=fs.readFileSync(path.join(root,route+'.html'),'utf8');assert(/rail-loader\.js\?v=[^"']+/.test(html));const driver=fs.readFileSync(path.join(root,'shared/rail-driver-'+route+'.js'),'utf8');assert(driver.includes('assetCache.run(()=>fetchModelAsset'));assert(driver.includes('assetCache.fetchJSON('));}
 for(const name of ['azusa','kaiji']){const html=fs.readFileSync(path.join(root,'rail-games/priority/batch-001/games/'+name+'.html'),'utf8');assert(html.indexOf('rail-asset-store.js')<html.indexOf('model-builder.js'));assert(html.includes('shared/rail-mesh-cache.js'));}
 console.log('PASS: byte-budget eviction, oversized model preserved, 12 concurrent jobs bounded to 2, failed job releases slot, stalled JSON body aborted, retry succeeds, route dependency order retained. No physical GPU claim.');
})().catch(e=>{console.error(e);process.exitCode=1;});
