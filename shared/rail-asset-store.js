/* Bound temporary model data and loading bursts without changing visible geometry. */
(function(g){'use strict';
 function create({maxBytes=32*1024*1024,concurrency=2,timeoutMs=25000}={}){
  if(!(maxBytes>0)||!Number.isInteger(concurrency)||concurrency<1||!(timeoutMs>0))throw Error('Invalid asset limits');
  const weights=new WeakMap(),entries=new Map(),queue=[];let bytes=0,active=0,peakActive=0,evictions=0;
  function sizeOf(value){
   if(value&&typeof value==='object'&&weights.has(value))return weights.get(value);
   const seen=new WeakSet(),stack=[value];let size=0;
   while(stack.length){const item=stack.pop();if(typeof item==='string'){size+=item.length*2;continue;}if(typeof item==='number'){size+=8;continue;}if(!item||typeof item!=='object')continue;if(seen.has(item))continue;seen.add(item);size+=32;
    if(ArrayBuffer.isView(item)){size+=item.byteLength;continue;}if(item instanceof ArrayBuffer){size+=item.byteLength;continue;}
    for(const key of Object.keys(item)){size+=key.length*2+8;stack.push(item[key]);}
   }
   if(value&&typeof value==='object')weights.set(value,size);return size;
  }
  function remove(key){const old=entries.get(key);if(!old)return false;bytes-=old.bytes;return entries.delete(key);}
  function pump(){while(active<concurrency&&queue.length){const job=queue.shift();active++;peakActive=Math.max(peakActive,active);Promise.resolve().then(job.work).then(job.resolve,job.reject).finally(()=>{active--;pump();});}}
  const api={get(key){return entries.get(key)?.value;},has:key=>entries.has(key),keys:()=>entries.keys(),delete:remove,clear(){entries.clear();bytes=0;},get size(){return entries.size;},
   set(key,value){remove(key);const size=sizeOf(value);if(size<=maxBytes){entries.set(key,{value,bytes:size});bytes+=size;}while(bytes>maxBytes){remove(entries.keys().next().value);evictions++;}return api;},
   run(work){return new Promise((resolve,reject)=>{queue.push({work,resolve,reject});pump();});},
   async fetchJSON(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await g.fetch(url,{signal:controller.signal});if(!response.ok)throw Error('model fetch: '+response.status);return await response.json();}catch(error){if(controller.signal.aborted)throw Error('模型データの通信が時間内に完了しませんでした。再試行できます。');throw error;}finally{clearTimeout(timer);}},
   getStats:()=>({bytes,maxBytes,entries:entries.size,active,queued:queue.length,peakActive,evictions})
  };return api;
 }
 g.BaylineAssetStore={create};
})(globalThis);
