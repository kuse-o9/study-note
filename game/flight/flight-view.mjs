import {world,clamp,local,distance} from './flight-model.mjs';
const R=Math.PI/180;
const rng=seed=>()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
const palette=['#475956','#52645a','#3c5953','#5a6e5d'];
function airportGeometry(a){
 let layer=0;
 const list=[],random=rng(a.id.charCodeAt(0)*521);
 const pt=(x,y,z)=>{const p=world(a,x,z);return[p[0],y,p[1]];};
 const p=(coords,color)=>list.push({v:coords.map(q=>pt(...q)),color,layer});
 const flat=(x,z,w,l,color,y=0)=>p([[x,y,z],[x+w,y,z],[x+w,y,z+l],[x,y,z+l]],color);
 const box=(x,z,w,l,h,top,side)=>{
  p([[x,0,z],[x+w,0,z],[x+w,h,z],[x,h,z]],side);p([[x+w,0,z],[x+w,0,z+l],[x+w,h,z+l],[x+w,h,z]],'#7c91a0');p([[x+w,0,z+l],[x,0,z+l],[x,h,z+l],[x+w,h,z+l]],side);p([[x,0,z+l],[x,0,z],[x,h,z],[x,h,z+l]],'#6b8190');flat(x,z,w,l,top,h);
 };
 if(a.shore){
  flat(-610,-420,1120,a.length+920,'#8e9e99',-.5);
  flat(-595,-400,1088,a.length+875,'#68816b',-.3);
  for(let i=0;i<8;i++)flat(507,-370+i*510,21,350,'#a6b4b0',-.3);
 }else flat(-680,-470,1230,a.length+970,'#6b8261',-.5);
 for(let z=-300;z<a.length+400;z+=145){flat(-480,z,130,140,palette[Math.floor(random()*4)],-.1);flat(206,z,210,140,palette[Math.floor(random()*4)],-.1);}
 layer=1;
 flat(-33,0,66,a.length,'#727a7d',.05);
 for(let z=0;z<a.length;z+=60){
  layer=2;flat(-30,z,60,Math.min(60,a.length-z),z%120?'#444e55':'#49525a',.1);
  layer=3;flat(-28,z,1.25,Math.min(59,a.length-z),'#e6e8db',.12);flat(27,z,1.25,Math.min(59,a.length-z),'#e6e8db',.12);
  if(z>=180&&z<a.length-130)flat(-.66,z,1.32,31,'#f0eee1',.13);
 }
 for(const z of [8,a.length-33])for(let x=-24;x<=24;x+=6)flat(x,z,3,26,'#eff1e5',.16);
 for(const z of [300,a.length-360])for(const x of [-19,14])flat(x,z,5,42,'#e9ebe3',.16);
 for(let z=130;z<420;z+=16)for(const x of [-4,3])flat(x,z,1.6,12,'#384249',.19);
 layer=2;flat(87,45,27,a.length-75,'#636c70',.11);
 layer=3;flat(100,48,1,a.length-83,'#f6c653',.14);
 for(const z of [85,800,a.length-310]){
  layer=2;flat(31,z,84,24,'#656e70',.09);layer=3;flat(35,z+12,66,1,'#e9b944',.14);
 }
 layer=2;flat(108,590,345,800,'#858f91',.08);
 for(let i=0;i<5;i++){
  layer=3;const z=655+i*125;flat(125,z,175,1.3,'#edc454',.15);flat(167,z-14,1,29,'#edc454',.15);
  layer=4;box(287,z-8,65,13,7,'#b0c8d2','#8099a7');
  box(349,z-31,74,89,20+i%2*6,'#d0dbe0','#476778');
  for(let x=357;x<420;x+=9)flat(x,z-29,2,84,'#9eb2bd',20.13+i%2*6);
 }
 layer=4;box(233,1270,13,14,45,'#bccbd0','#a0b0b6');
 box(230,1267,19,20,49,'#c8dce0','#344e64');
 box(-310,920,66,73,15,'#9badb7','#748b97');box(-310,1010,66,73,15,'#b8c3ca','#738996');
 const lights=[];
 for(let z=-330;z<0;z+=35)for(const x of z>-120?[-7,0,7]:[0])lights.push({p:pt(x,.55,z),color:'#f9f3d8'});
 for(let z=0;z<a.length;z+=56)for(const x of [-31,31])lights.push({p:pt(x,.45,z),color:z<80?'#a8ffe7':'#e4f5ff'});
 for(let z=75;z<a.length-60;z+=95)for(const x of [86,115])lights.push({p:pt(x,.5,z),color:'#65a9ff'});
 const signs=[{p:pt(0,.19,57),t:a.runway}];
 return {list,lights,signs};
}
function cloudTexture(seed){
 const c=document.createElement('canvas');c.width=288;c.height=126;const x=c.getContext('2d'),rand=rng(seed);
 for(let i=0;i<28;i++){const u=26+rand()*234,v=51+rand()*36-17*Math.sin(u/288*Math.PI),r=14+rand()*28;
  const gr=x.createRadialGradient(u,v-6,1,u,v,r);gr.addColorStop(0,'rgba(255,255,255,.87)');gr.addColorStop(.62,'rgba(229,239,250,.57)');gr.addColorStop(1,'rgba(205,224,241,0)');x.fillStyle=gr;x.fillRect(u-r,v-r,r*2,r*2);}
 return c;
}
function clip(pts,near=3){
 const out=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];if(a[2]>=near)out.push(a);if((a[2]>=near)!==(b[2]>=near)){const t=(near-a[2])/(b[2]-a[2]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,near]);}}
 return out;
}
export function makeView(canvas,airports){
 const c=canvas.getContext('2d',{alpha:false}),airportsGeo=new Map(airports.map(a=>[a.id,airportGeometry(a)])),sprites=[1,5,8].map(cloudTexture);
 const random=rng(122987);const clouds=Array.from({length:280},()=>({x:-100000+random()*123000,z:-42500+random()*72000,y:550+random()*2450,s:430+random()*1350,kind:Math.floor(random()*3)}));
 function draw(f){
  const w=canvas.width,h=canvas.height,F=w*.64,x0=w*.5,y0=h*.46,H=f.h+4;
  const head=f.heading*R,pitch=(f.pitch*.72+3.5)*R,roll=f.bank*.65*R,cH=Math.cos(head),sH=Math.sin(head),cP=Math.cos(pitch),sP=Math.sin(pitch),cR=Math.cos(roll),sR=Math.sin(roll);
  function cam([x,y,z]){const dx=x-f.x,dz=z-f.z,xx=dx*cH-dz*sH,zz=dx*sH+dz*cH,dy=y-H;return [xx,dy*cP-zz*sP,zz*cP+dy*sP];}
  function screen(v){return [x0+v[0]*F/v[2],y0-v[1]*F/v[2]];}
  const horizon=y0+F*Math.tan(pitch);
  const nearest=distance(f,f.from)<distance(f,f.to)?f.from:f.to;
  c.save();c.translate(x0,y0);c.rotate(-roll);c.translate(-x0,-y0);
  let gr=c.createLinearGradient(0,0,0,Math.max(2,horizon));gr.addColorStop(0,'#2f6597');gr.addColorStop(.63,'#84b5dc');gr.addColorStop(1,'#d4e5e9');c.fillStyle=gr;c.fillRect(-w,-h,w*3,h+horizon);
  gr=c.createLinearGradient(0,horizon,0,Math.max(horizon+2,h*1.1));gr.addColorStop(0,'#a5bbba');gr.addColorStop(.19,nearest.shore?'#749ca6':'#8da188');gr.addColorStop(1,nearest.shore?'#325a6a':'#5a7256');c.fillStyle=gr;c.fillRect(-w,horizon,w*3,h*3);
  c.fillStyle='#9aafad';c.beginPath();c.moveTo(-w,horizon+2);for(let i=-20;i<70;i++){const t=(i*.33+head*1.7);c.lineTo(i*w/32,horizon-4-(Math.sin(t)*.5+.5)*(Math.sin(t*.41)*.5+.5)*h*.062);}c.lineTo(w*3,horizon+3);c.fill();
  for(const cloud of clouds){const v=cam([cloud.x,cloud.y,cloud.z]);if(v[2]<220||v[2]>29000)continue;const [x,y]=screen(v),size=F*cloud.s/v[2];if(x<-size||x>w+size||y<-size||y>h+size)continue;c.globalAlpha=clamp(v[2]/480,0,1)*clamp((31500-v[2])/11000,0,.86);c.drawImage(sprites[cloud.kind],x-size/2,y-size*.22,size,size*.44);}
  c.globalAlpha=1;
  const faces=[];
  for(const a of airports){
   if(distance(f,a)>12000)continue;
   const geo=airportsGeo.get(a.id);
   for(const o of geo.list){const v=clip(o.v.map(cam));if(v.length<3)continue;const z=v.reduce((t,p)=>t+p[2],0)/v.length;faces.push({v,z,color:o.color,layer:o.layer});}
  }
  faces.sort((a,b)=>a.layer-b.layer||b.z-a.z);
  for(const o of faces){const pts=o.v.map(screen);if(pts.every(p=>p[0]<-w)||pts.every(p=>p[0]>2*w)||pts.every(p=>p[1]>2*h))continue;
   c.fillStyle=o.color;c.beginPath();c.moveTo(...pts[0]);for(const p of pts.slice(1))c.lineTo(...p);c.closePath();c.fill();}
  for(const a of airports){
   if(distance(f,a)>9000)continue;const geo=airportsGeo.get(a.id);
   for(const o of geo.lights){const v=cam(o.p);if(v[2]<5)continue;const [x,y]=screen(v),r=clamp(F*1.8/v[2],.65,3.1);if(x<-w||x>2*w||y>h*2)continue;c.fillStyle=o.color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
   for(const o of geo.signs){const v=cam(o.p);if(v[2]<18||v[2]>850)continue;const [x,y]=screen(v);c.fillStyle='#f5f3de';c.font='bold '+clamp(F*9/v[2],9,60)+'px system-ui';c.textAlign='center';c.fillText(o.t,x,y);}
  }
  c.restore();
  // Window frame stays level with the pilot; the scenery rotates with the aircraft.
  c.fillStyle='#152735';c.beginPath();c.moveTo(0,0);c.lineTo(w*.13,0);c.lineTo(w*.047,h*.78);c.lineTo(w*.12,h*.87);c.lineTo(w*.88,h*.87);c.lineTo(w*.953,h*.78);c.lineTo(w*.87,0);c.lineTo(w,0);c.lineTo(w,h);c.lineTo(0,h);c.fill();
  c.strokeStyle='#526a78';c.lineWidth=Math.max(2,w*.003);c.beginPath();c.moveTo(0,h*.83);c.lineTo(w*.12,h*.885);c.lineTo(w*.88,h*.885);c.lineTo(w,h*.83);c.stroke();
  c.strokeStyle='#e5ffec';c.lineWidth=1.3;c.beginPath();c.moveTo(x0-25,y0);c.lineTo(x0-8,y0);c.lineTo(x0,y0+5);c.lineTo(x0+8,y0);c.lineTo(x0+25,y0);c.stroke();
  c.font='bold '+Math.round(w*.017)+'px system-ui';c.textAlign='center';c.fillStyle='#d6f3fc';c.fillText('BAYLINE   /   FLIGHT DECK',x0,h*.949);
 }
 return {draw};
}
