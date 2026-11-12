'use strict';
(()=>{
 const S=window.Study,$=id=>document.getElementById(id),list=$('race-rows'),status=$('race-status'),toggle=$('race-toggle'),reload=$('race-refresh');
 if(!S?.client||!list)return;
 let actor=null,seq=0,pending=false,joined=false;
 function render(data){list.replaceChildren();joined=!!data.mine;toggle.textContent=joined?'ランキングへの参加をやめる':'匿名でポイントレースに参加';for(const row of data.rows){const li=document.createElement('li');li.textContent=row.place+'位　'+row.name+(row.self?'（自分）':'')+'　'+row.points+' pt';list.append(li);}status.textContent=data.mine?'自分の順位：'+data.mine.place+'位 ・ '+data.mine.points+' pt':data.rows.length?'参加すると、累計ポイントと匿名名が表示されます。':'まだ参加者はいません。';}
 async function load(action='list'){if(!actor||pending)return;const ticket=++seq;pending=true;toggle.disabled=reload.disabled=true;try{const {data,error}=await S.client.rpc('study_point_race',{p_action:action});if(ticket!==seq)return;if(error||!Array.isArray(data?.rows))throw Error();render(data);}catch{if(ticket===seq)status.textContent='ランキングを読み込めません。もう一度お試しください。';}finally{if(ticket===seq){pending=false;toggle.disabled=reload.disabled=false;}}}
 function session(s){const id=s?.user?.id??null;if(id===actor)return;actor=id;seq++;pending=false;joined=false;list.replaceChildren();toggle.hidden=reload.hidden=!id;status.textContent=id?'読み込み中…':'ログインするとランキングを見られます。';if(id)setTimeout(()=>void load(),0);}
 toggle.onclick=()=>{if(joined||confirm('ランキングに匿名名と累計ポイントを表示します。参加しますか？'))void load(joined?'leave':'join');};reload.onclick=()=>void load();
 S.client.auth.onAuthStateChange((_,s)=>session(s));const initial=seq;S.client.auth.getSession().then(({data})=>{if(initial===seq)session(data?.session);}).catch(()=>{});
})();
