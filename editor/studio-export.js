import{cameraSegments}from'./studio-cameras.js?v=20261111proxy3';
import{trimClip}from'./studio-math.js?v=20261111proxy3';
import{sourceOffset,speedAt}from'./studio-math.js?v=20261111proxy3';
const delay=()=>new Promise(r=>setTimeout(r,0));
export async function exportFrames(api,{format='webm',fps=30,onProgress=()=>{},cancelled=()=>false}={}){
 const {assets,clips,canvas}=api.get(),duration=Math.max(0,...clips.map(c=>c.start+c.duration));
 if(!duration||duration>120)throw Error('コマ単位の書き出しは1回120秒以内です。長い作品は通常の書き出しをご利用ください。');
 if(!clips.some(c=>['video','overlay'].includes(c.track)))throw Error('映像を追加してください。');
 if(clips.some(c=>c.asset&&!assets.find(a=>a.id===c.asset)?.el))throw Error('不足している元素材を追加してください。');
 const mb=await import('./vendor/mediabunny-1.65.2.mjs'),codec=format==='mp4'?'avc':'vp9',audioCodec=format==='mp4'?'aac':'opus';
 const bitrate=Math.round(12000000*canvas.width*canvas.height/(1920*1080));
 if(!await mb.canEncodeVideo(codec,{width:canvas.width,height:canvas.height,bitrate}))throw Error('この端末では指定サイズ・形式の映像を書き出せません。解像度または形式を選び直してください。');
 const candidates=clips.filter(c=>c.asset&&assets.find(a=>a.id===c.asset)?.kind!=='image'&&c.volume>0).flatMap(c=>cameraSegments(c,clips).map(([a,b])=>trimClip(c,a,b))),presence=new Map();
 for(const c of candidates){if(presence.has(c.asset))continue;if(cancelled())throw Error('中止しました。');const a=assets.find(a=>a.id===c.asset);if(!a.file)throw Error('元の素材をもう一度接続してください。');if(a.kind==='audio'){presence.set(c.asset,true);continue;}const input=new mb.Input({formats:mb.ALL_FORMATS,source:new mb.BlobSource(a.file)});try{presence.set(c.asset,!!await input.getPrimaryAudioTrack());}catch{throw Error(a.name+' の音声トラックを確認できません。音声を省略せず中止しました。');}finally{input.dispose();}}
 const sounding=candidates.filter(c=>presence.get(c.asset));
 if(sounding.length&&!await mb.canEncodeAudio(audioCodec,{numberOfChannels:2,sampleRate:48000}))throw Error('この端末では選択形式の音声を書き出せません。WebMを選び直してください。');
 const target=new mb.BufferTarget(),output=new mb.Output({format:format==='mp4'?new mb.Mp4OutputFormat():new mb.WebMOutputFormat(),target});let finalized=false;
 const video=new mb.CanvasSource(canvas,{codec,bitrate});output.addVideoTrack(video,{frameRate:fps});let sound;if(sounding.length){sound=new mb.AudioBufferSource({codec:audioCodec,bitrate:192000});output.addAudioTrack(sound);}
 try{
  let mixed;if(sound){const off=new OfflineAudioContext(2,Math.ceil(duration*48000),48000),decoded=new Map();for(const c of sounding){if(cancelled())throw Error('中止しました。');const a=assets.find(a=>a.id===c.asset);if(!a.file)throw Error('音声付きの書き出しには元の素材をもう一度追加してください。');let buffer=decoded.get(a.id);if(!buffer){try{buffer=await off.decodeAudioData(await a.file.arrayBuffer());}catch{throw Error(a.name+' の音声を読み取れません。無音で出力せず中止しました。');}decoded.set(a.id,buffer);}const src=off.createBufferSource();src.buffer=buffer;const gain=off.createGain(),pan=off.createStereoPanner(),low=off.createBiquadFilter(),mid=off.createBiquadFilter(),high=off.createBiquadFilter(),cut=off.createBiquadFilter(),compress=off.createDynamicsCompressor();low.type='lowshelf';low.frequency.value=200;low.gain.value=c.bass||0;mid.type='peaking';mid.frequency.value=1000;mid.gain.value=c.mid||0;high.type='highshelf';high.frequency.value=5000;high.gain.value=c.treble||0;cut.type='highpass';cut.frequency.value=c.highpass||0;compress.ratio.value=c.compress?4:1;compress.threshold.value=c.compress?-18:0;pan.pan.value=c.pan||0;src.connect(low);low.connect(mid);mid.connect(high);high.connect(cut);cut.connect(gain);gain.connect(compress);compress.connect(pan);pan.connect(off.destination);src.playbackRate.setValueAtTime(speedAt(c,0),c.start);for(const p of c.rateCurve||[])if(p.time>0)src.playbackRate.linearRampToValueAtTime(p.speed,c.start+p.time);gain.gain.setValueAtTime(0,c.start);gain.gain.linearRampToValueAtTime(c.volume,c.start+Math.min(.15,c.duration/2));gain.gain.setValueAtTime(c.volume,c.start+c.duration-Math.min(.15,c.duration/2));gain.gain.linearRampToValueAtTime(0,c.start+c.duration);src.start(c.start,c.trim);src.stop(c.start+c.duration);await delay();}mixed=await off.startRendering();decoded.clear();}
  await output.start();if(sound){await sound.add(mixed);sound.close();mixed=null;}
  const count=Math.ceil(duration*fps);for(let i=0;i<count;i++){if(cancelled())throw Error('中止しました。編集内容は残っています。');const t=i/fps;await api.renderAt(t);await video.add(t,Math.min(1/fps,duration-t));if(i%10===0){onProgress(i/count);await delay();}}video.close();await output.finalize();finalized=true;onProgress(1);return new Blob([target.buffer],{type:format==='mp4'?'video/mp4':'video/webm'});
 }finally{if(!finalized)await output.cancel();}
}
