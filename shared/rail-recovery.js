/* Pause and preserve the trip on context loss; use the full error dialog. */
(function(g){'use strict';
 function watch(viewer,pauseAndSave){
  let failed=false,button=document.getElementById('rail-retry3d');
  if(!button){button=document.createElement('button');button.id='rail-retry3d';button.type='button';button.textContent='3Dを再読み込み';button.className='secondary';const status=document.getElementById('scene-status');status?.parentNode.insertBefore(button,status.nextSibling);}
  button.onclick=()=>{pauseAndSave(true);location.reload();};
  function fail(error){if(failed||viewer.isDestroyed?.())return;failed=true;viewer.useDefaultRenderLoop=false;if(g.BaylineSceneStart?.failure)g.BaylineSceneStart.failure(error||Error('3D描画が停止しました。'),pauseAndSave);else{pauseAndSave(false);const status=document.getElementById('scene-status');if(status){status.textContent='3D描画が停止しました。運転記録を保存しました。「3Dを再読み込み」で復帰できます。';status.style.whiteSpace='normal';}}}
  viewer.scene.renderError.addEventListener((scene,error)=>fail(error));
  viewer.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail(Object.assign(Error('WebGL2のGPU接続が途中で失われました。'),{code:'WEBGL_START'}));});
  viewer.canvas.addEventListener('webglcontextrestored',()=>{if(!failed||viewer.isDestroyed?.())return;viewer.useDefaultRenderLoop=false;const current=document.getElementById('rail-retry3d');if(current)current.textContent='接続が戻りました・3Dを再読み込み';const status=document.getElementById('scene-status');if(status)status.textContent='GPU接続が戻りました。保存した運転を保ち、「3Dを再読み込み」で描画を作り直せます。';});
  return {fail};
 }
 g.BaylineRecovery={watch};
})(window);
