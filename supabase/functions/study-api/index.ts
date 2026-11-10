// Supabase Edge Functions の study-api / index.ts 専用。GitHubには入れません。
import { createClient } from 'npm:@supabase/supabase-js@2.102.0';
const ORIGIN = 'https://kuse-o9.github.io';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function readBody(req: Request, limit: number) {
 const reader = req.body?.getReader();
 if (!reader) return new Uint8Array();
 const chunks: Uint8Array[] = []; let length = 0;
 while (true) {
  const {value,done} = await reader.read(); if (done) break;
  length += value.length;
  if (length > limit) { await reader.cancel(); throw new Fault(413,'入力が大きすぎます。'); }
  chunks.push(value);
 }
 const result = new Uint8Array(length); let offset = 0;
 for (const chunk of chunks) { result.set(chunk,offset);offset += chunk.length; }
 return result;
}
// Inspect routing/identity fields only: study answers and feedback text may legitimately contain code.
function securityAttackSignal(action: unknown, input: any, actor: string | null): string | null {
 for (const key of ['actor','p_actor','user_id','owner_id']) {
  if (typeof input[key]==='string' && UUID.test(input[key]) && input[key]!==actor) return 'identity_spoof';
 }
 if(input.role==='service_role' || input.owner===true) return 'identity_spoof';
 for(const value of [action,...['id','deck_id','question_id','target','new_id','confirmTarget'].map(k=>input[k])]){
  if(typeof value!=='string')continue;
  if(value.includes('../') || value.includes('..'+String.fromCharCode(92)) || /%2e%2e(?:%2f|%5c)/i.test(value))return 'path_traversal';
  if(/(?:'\s*(?:or|and)\b|\bunion\s+select\b|;\s*(?:select|drop|delete|update)\b|<\s*(?:script|svg|img)\b)/i.test(value))return 'id_injection';
 }
 return null;
}

const IMAGE = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;
class Fault extends Error { constructor(public status: number, message: string) { super(message); } }
function id(value: unknown) { if (typeof value !== 'string' || !UUID.test(value)) throw new Fault(422,'IDが正しくありません。'); return value; }
function text(value: unknown, max: number, required = false) {
 if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Fault(422,'入力内容や文字数を確認してください。');
 return value;
}
function revision(input: any) { if (input.id && (!Number.isInteger(input.revision) || input.revision < 1)) throw new Fault(422,'再読み込みしてから編集してください。'); }
const ADMIN_HTML = `<section class="card"><div class="editor-bar"><div><h2>管理者ダッシュボード</h2><p id="counts" class="muted"></p></div><button id="reload" class="secondary">最新の状態に更新</button></div></section>
<section class="card"><h2>お客さんの公開デッキ・通報</h2><a class="button" href="admin-community.html">公開デッキと通報を管理する</a></section>
<section class="card"><h2>フィードバック</h2><a class="button" href="admin-feedback.html">フィードバックを見る</a><p id="feedback-count" class="muted"></p></section>
<section class="card" id="history-panel"><div class="editor-bar"><h2>操作履歴</h2><button id="history-refresh" class="secondary">履歴を更新</button></div><p class="muted">操作した日時・アカウントID・対象・結果を確認できます。履歴の削除には理由付き申請とオーナー承認が必要です。申請・承認の記録は消せません。</p><div><button id="history-prev" class="secondary">前のページ</button><span id="history-page"></span><button id="history-next" class="secondary">次のページ</button></div><div id="history-list"></div></section>
<section class="card" id="requests-panel"><div class="editor-bar"><h2>削除申請と承認</h2><button id="requests-refresh" class="secondary">申請を更新</button></div><p class="muted">申請時点では削除されません。オーナーが理由と対象を確認して承認すると削除します。</p><div><button id="requests-prev" class="secondary">前のページ</button><span id="requests-page"></span><button id="requests-next" class="secondary">次のページ</button></div><div id="request-list"></div></section>

<section class="card"><h2>デッキと問題を作る</h2><p class="muted">①デッキを保存 → ②問題を追加 → ③公開。「保存して次の問題へ」で続けて作れます。</p>
<div class="columns"><aside class="editor-sidebar"><button id="new-deck">＋ 新しいデッキ</button><p class="muted">編集するデッキを選ぶ</p><div id="deck-list"></div></aside><div>
<div class="editor-bar"><h3><span class="step-badge">1</span>デッキの設定</h3><span id="deck-info" class="field-note"></span></div>
<form id="deck-form"><label>デッキ名 <span class="field-note">必須</span><input id="deck-title" maxlength="100" placeholder="例：中１数学・一次方程式" required></label><label>説明<textarea id="deck-description" maxlength="1000" placeholder="どんな問題が入っているか、ひとこと"></textarea></label>
<div class="field-pair"><label>ジャンル <span class="field-note">必須</span><input id="deck-genre" maxlength="40" placeholder="例：定期テスト" required></label><label>教科 <span class="field-note">必須</span><input id="deck-subject" maxlength="40" placeholder="例：数学" required></label></div><label>学年 <span class="field-note">必須</span><input id="deck-grade" maxlength="40" placeholder="例：中学１年" required></label>
<label class="publish-row"><input type="checkbox" id="deck-published">デッキを公開する <span class="field-note">問題を１問以上保存してから</span></label><button>デッキ設定を保存</button></form>
<details id="delete-deck-box" hidden><summary>このデッキの削除を申請</summary><label>削除したい理由（５〜1000文字）<textarea id="delete-deck-reason" minlength="5" maxlength="1000" placeholder="なぜ削除が必要かを書いてください。個人情報は書かないでください。"></textarea></label><button type="button" id="request-deck-delete" class="danger">理由を送って削除を申請</button></details>
<div class="editor-step"><div class="editor-bar"><h3><span class="step-badge">2</span>問題を追加・編集</h3><button id="new-question" class="secondary" disabled>＋ 新しい問題</button></div><p id="question-count" class="muted">まずデッキを保存してください。</p><div id="question-list"></div>
<form id="question-form" hidden><div class="editor-bar"><h3 id="question-title">新しい問題</h3><button id="copy-question" class="secondary" type="button" hidden>この問題を複製</button></div>
<label>問題文 <span class="field-note">必須</span><textarea id="q-prompt" maxlength="4000" placeholder="例：次の方程式を解きなさい。3x＋7＝22" required></textarea></label><label>答え <span class="field-note">必須</span><textarea id="q-answer" maxlength="4000" placeholder="例：x＝5" required></textarea></label><label>解説<textarea id="q-explanation" maxlength="8000" placeholder="途中式や、覚えてほしいポイント"></textarea></label>
<div class="image-upload"><label>問題の画像 <span class="field-note">任意・PNG／JPEG／WebP・５MB以下</span><input id="q-image" type="file" accept="image/png,image/jpeg,image/webp"></label><img id="q-preview" class="question-image" alt="問題の画像" hidden><label><input type="checkbox" id="q-remove-image">今の画像を外す</label></div>
<details><summary>ヒント・並び順を設定</summary><label>ヒント<textarea id="q-hint" maxlength="2000" placeholder="答えをすぐ出さず、考える手がかりを書こう"></textarea></label><label>並び順<input id="q-position" type="number" min="1" max="10001" value="1" required></label></details>
<div class="form-actions"><button type="submit" value="next" id="save-next">保存して次の問題へ →</button><button type="submit" value="stay" class="secondary">保存してこの問題に残る</button><button id="delete-question" type="button" class="danger" hidden>この問題の削除を申請</button></div><p class="completion-note">Ctrl＋Enter（Macは⌘＋Enter）でも保存して次へ。最後にデッキの「公開する」をチェックして保存すると、学習画面に表示されます。</p></form></div>
</div></div></section>
<section class="card"><h2>アカウント削除の申請</h2><p>理由付き申請をオーナーが承認したときだけ削除します。オーナー・管理者は削除対象にできません。</p><div><button id="account-requests-refresh" class="secondary">申請を更新</button><button id="account-requests-prev" class="secondary">前のページ</button><span id="account-requests-page"></span><button id="account-requests-next" class="secondary">次のページ</button></div><div id="account-request-list"></div></section>
<section class="card"><h2>アカウント管理</h2><p class="muted">管理者と自分のアカウントはBAN・削除できません。アカウントを削除しても、ブラウザー内の個人ノートは消えません。メールアドレスはオーナーだけに表示します。アカウント削除は理由付き申請とオーナー承認が必要です。</p><div><button id="users-prev" class="secondary">前のページ</button> <span id="users-page"></span> <button id="users-next" class="secondary">次のページ</button></div><div id="user-list"></div></section>
`;
const OWNER_HTML = `<section class="card"><h2>オーナー専用の操作</h2><p>削除申請の承認・却下、アカウント削除、管理者の追加・解除はオーナーだけができます。</p></section>`;
const ADMIN_SCRIPT = String.raw`// このモジュールは index.ts に埋め込まれ、認証済み管理者だけに送信します。
export default async function mount(root,info,message) {
 const S=window.Study,$=id=>root.querySelector('#'+id);let deck=null,question=null,page=1,busy=false,hasNext=false,deckDirty=false,questionDirty=false,pendingFocus=false,historyPage=1,requestPage=1,historyNext=false,requestNext=false,accountRequestPage=1,accountRequestNext=false;
 const note=(s,error=false)=>{message.textContent=s;message.classList.toggle('error',error);};
 async function run(work){
  if(busy || !root.isConnected || !root.children.length)return;
  busy=true;root.setAttribute('aria-busy','true');const buttons=[...root.querySelectorAll('button,input,textarea,select')],state=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
  try{await work();}catch(e){note(e.message,true);if(e.status===401 || e.status===403)root.replaceChildren();}
  finally{busy=false;root.removeAttribute('aria-busy');buttons.forEach((b,i)=>{if(b.isConnected)b.disabled=state[i];});if($('new-question'))$('new-question').disabled=!deck;if($('deck-published'))$('deck-published').disabled=!deck;if($('users-prev'))$('users-prev').disabled=page===1;if($('users-next'))$('users-next').disabled=!hasNext;syncPages();if($('account-requests-prev')){$('account-requests-prev').disabled=accountRequestPage===1;$('account-requests-next').disabled=!accountRequestNext;}if(pendingFocus && $('q-prompt')){$('q-prompt').focus();pendingFocus=false;}}
 }
 function mayLeave(scope='all'){return !(scope==='question'?questionDirty:deckDirty || questionDirty) || confirm('保存していない入力があります。入力を破棄して切り替えますか？');}
 root.addEventListener('input',e=>{if(e.target.closest('#question-form'))questionDirty=true;else if(e.target.closest('#deck-form'))deckDirty=true;});
 window.addEventListener('beforeunload',e=>{if(deckDirty || questionDirty){e.preventDefault();e.returnValue='';}});
 function button(label,work,cls=''){const b=document.createElement('button');b.textContent=label;b.type='button';b.className=cls;b.onclick=()=>run(work);return b;}
 function paragraph(parent,s){const p=document.createElement('p');p.textContent=s;parent.append(p);}
 function showQuestion(q){
  question=q;questionDirty=false;pendingFocus=true;$('question-form').hidden=false;$('question-title').textContent=q?'問題を編集':'新しい問題';$('copy-question').hidden=!q;for(const field of ['prompt','answer','explanation','hint'])$('q-'+field).value=q?.[field] || '';
  $('q-position').value=q?(q.position+1):Math.max(-1,...deck.questions.map(item=>item.position))+2;$('q-image').value='';$('q-remove-image').checked=false;
  $('q-preview').hidden=!q?.image_url;if(q?.image_url)$('q-preview').src=q.image_url;else $('q-preview').removeAttribute('src');
  $('delete-question').hidden=!q;for(const b of $('question-list').querySelectorAll('button'))b.classList.toggle('active',b.dataset.id===q?.id);
 }
 function showDeck(d){
  deck=d;question=null;deckDirty=false;questionDirty=false;for(const f of ['title','description','genre','subject','grade'])$('deck-'+f).value=d?.[f] || '';
  $('delete-deck-box').hidden=!d;$('delete-deck-reason').value='';$('deck-published').checked=d?.published || false;$('deck-published').disabled=!d;$('question-form').hidden=true;$('new-question').disabled=!d;
  $('deck-info').textContent=d?(d.published?'公開中':'下書き'):'未保存';$('question-count').textContent=d?d.questions.length+'問を保存済み':'まずデッキを保存してください。';
  $('question-list').replaceChildren();for(const q of d?.questions || []){const b=button((q.position+1)+'. '+q.prompt.slice(0,50),async()=>{if(mayLeave('question'))showQuestion(q);},'secondary question-entry');b.dataset.id=q.id;$('question-list').append(b);}
 }
 async function loadDeck(id){showDeck(await S.api('admin_deck',{id}));}
 async function decks(){
  const list=await S.api('admin_decks');$('deck-list').replaceChildren();
  for(const d of list){const row=document.createElement('div');row.className='deck-entry';row.append(button(d.title,async()=>{if(mayLeave())await loadDeck(d.id);},'secondary'));paragraph(row,(d.published?'公開':'下書き')+'・'+d.question_count+'問・'+d.genre+' / '+d.subject+' / '+d.grade);$('deck-list').append(row);}
  if(!list.length)paragraph($('deck-list'),'まだデッキはありません。');
 }
 async function accounts(){
  const result=await S.api('users',{page});hasNext=result.hasNext;$('users-page').textContent=page+'ページ';$('users-prev').disabled=page===1;$('users-next').disabled=!result.hasNext;$('user-list').replaceChildren();
  for(const u of result.users){
   const row=document.createElement('div');row.className='user-row';paragraph(row,(u.nickname || '学習ユーザー')+' ／ ID：'+u.id);if(info.owner && u.email)paragraph(row,u.email);paragraph(row,(u.owner?'オーナー':u.admin?'管理者':'一般アカウント')+'・'+(u.blocked?'利用停止中':'利用可能')+'・'+(u.confirmed?'メール確認済み':'メール未確認')+(u.pending?'・処理待ち':''));
   async function act(action,label){
    const expected=info.owner?u.email:u.id;const confirmation=prompt((u.nickname || '学習ユーザー')+'\n'+label+'を実行します。確認のため、'+(info.owner?'メールアドレス':'アカウントID')+'を入力してください。\n'+expected);
    if(confirmation===null)return;
    if(confirmation!==expected){note('確認入力が一致しません。操作を中止しました。',true);return;}
    if(action==='delete' && !confirm('アカウント削除は元に戻せません。本当に削除しますか？'))return;
    await S.api(action,{target:u.id,...(info.owner?{confirmEmail:confirmation}:{confirmTarget:confirmation})});note(label+'が完了しました。');await accounts();const count=await S.api('admin_bootstrap');$('counts').textContent='登録アカウント '+count.accounts+'人 ／ 管理者 '+count.admins+'人';await history();
   }
   if(u.pending){if(info.owner)row.append(button('処理待ち解除（15分後）',()=>act('recover_account','処理待ち解除')));}
   else if(!u.admin && !u.owner){row.append(button(u.blocked?'BAN解除':'永久BAN',()=>act(u.blocked?'unban':'ban',u.blocked?'BAN解除':'永久BAN'),'danger'),...[]);}
   if(!u.admin && !u.owner && !u.pending){const box=document.createElement('details'),summary=document.createElement('summary');summary.textContent='アカウント削除を申請';box.append(summary);const label=document.createElement('label');label.textContent='削除したい理由（５〜1000文字・個人情報は書かないでください）';const reason=document.createElement('textarea');reason.minLength=5;reason.maxLength=1000;label.append(reason);box.append(label,button('理由を送って削除を申請',async()=>{await S.api('account_request_delete',{target:u.id,reason:validateReason(reason.value)});reason.value='';accountRequestPage=1;await accountRequests();await history();note('アカウント削除を申請しました。オーナーの承認までは削除されません。');},'danger'));row.append(box);}
   if(info.owner && !u.owner && !u.pending && !u.blocked && u.confirmed)row.append(button(u.admin?'管理者を解除':'管理者にする',()=>act(u.admin?'remove_admin':'add_admin',u.admin?'管理者解除':'管理者追加'),'secondary'));
   $('user-list').append(row);
  }
  if(!result.users.length)paragraph($('user-list'),'このページにはアカウントがありません。');
 }

 const labels={personal_deck_deleted:'本人が個人デッキを削除',community_moderate:'お客さんのデッキの公開停止・解除',community_report_resolved:'公開デッキの通報に対応',account_request_delete:'アカウント削除申請',account_review_delete:'アカウント削除の承認・却下',account_recover_request:'アカウント削除の処理確認',account_delete_request:'アカウント削除を申請',account_delete_approved:'アカウント削除を承認',account_delete_rejected:'アカウント削除を却下',account_delete_finished:'アカウント削除の結果',account_delete_recovered:'アカウント削除の処理確認',self_delete_started:'本人によるアカウント削除を開始',self_delete_finished:'本人によるアカウント削除の結果',feedback_status:'フィードバックの対応状況を変更',save_deck:'デッキを保存',save_question:'問題を保存',admin_decks:'デッキ一覧を表示',admin_deck:'デッキを表示',users_state:'アカウント一覧を表示',add_admin:'管理者を追加',remove_admin:'管理者を解除',begin_account:'アカウント操作を開始',finish_account:'アカウント操作を終了',recover_account:'処理待ちを解除',request_delete:'削除申請',approve_delete:'削除を承認・実行',reject_delete:'削除を却下',failed_action:'操作に失敗',upload_started:'画像アップロードを開始',upload_finished:'画像アップロード完了'};
 const kinds={account:'アカウント',deck:'デッキ',question:'問題',audit:'操作履歴'},outcomes={success:'完了',failed:'失敗',started:'開始（完了記録を確認）',legacy:'以前のアカウント操作'};
 function syncPages(){for(const [prefix,p,n] of [['history',historyPage,historyNext],['requests',requestPage,requestNext]]){if($(prefix+'-prev')){$(prefix+'-prev').disabled=p===1;$(prefix+'-next').disabled=!n;$(prefix+'-page').textContent=p+'ページ';}}}
 async function accountRequests(){
  const result=await S.api('account_requests',{page:accountRequestPage});accountRequestNext=result.hasNext;$('account-requests-page').textContent=accountRequestPage+'ページ';$('account-requests-prev').disabled=accountRequestPage===1;$('account-requests-next').disabled=!accountRequestNext;$('account-request-list').replaceChildren();
  for(const r of result.items){const row=document.createElement('div');row.className='user-row';paragraph(row,r.label+' ／ '+({pending:'承認待ち',rejected:'却下',executing:'承認済み・処理中（実行記録を確認）',deleted:'削除完了',failed:'削除失敗・利用停止中'}[r.status]));paragraph(row,'対象ID：'+r.target+' ／ 申請者ID：'+r.requester);paragraph(row,'申請理由：'+r.reason+' ／ '+new Date(r.created_at).toLocaleString('ja-JP'));if(r.review_reason)paragraph(row,'審査理由：'+r.review_reason);
   if(info.owner && r.status==='pending')for(const decision of ['approve','reject'])row.append(button(decision==='approve'?'承認して削除':'却下',async()=>{const reason=prompt((decision==='approve'?'承認':'却下')+'する理由（５〜1000文字）');if(reason===null)return;let confirmTarget;if(decision==='approve'){confirmTarget=prompt('削除は元に戻せません。対象のアカウントIDを入力してください。\n'+r.target);if(confirmTarget===null)return;if(confirmTarget!==r.target)throw new Error('対象IDが一致しません。');}let result;try{result=await S.api('account_review_delete',{id:r.id,decision,reason:validateReason(reason),confirmTarget});}finally{await accountRequests();await accounts();await history();}note(decision==='reject'?'申請を却下しました。':result?.receiptPending?'削除しました。完了記録が未確定のため、15分後に処理確認をしてください。':'承認してアカウントを削除しました。');},decision==='approve'?'danger':'secondary'));
   if(info.owner && r.status==='executing')row.append(button('処理結果を確認（15分後）',async()=>{await S.api(r.self?'account_recover_self':'account_recover_request',{id:r.id});await accountRequests();await accounts();await history();note('処理結果を確認しました。削除に失敗したアカウントは利用停止を維持します。');},'secondary'));
   $('account-request-list').append(row);
  }if(!result.items.length)paragraph($('account-request-list'),'アカウント削除の申請はまだありません。');
 }
 $('account-requests-refresh').onclick=()=>run(accountRequests);$('account-requests-prev').onclick=()=>run(async()=>{if(accountRequestPage>1){accountRequestPage--;await accountRequests();}});$('account-requests-next').onclick=()=>run(async()=>{if(accountRequestNext){accountRequestPage++;await accountRequests();}});
 function validateReason(reason){const value=reason.trim();if(value.length<5 || value.length>1000)throw new Error('理由を５〜1000文字で書いてください。');return value;}
 async function requestDeletion(kind,target,reason,revision){await S.api('request_delete',{kind,target,reason:validateReason(reason),revision});requestPage=1;historyPage=1;await requests();await history();note('削除申請を送りました。オーナーの承認までは残ります。');}
 async function history(){const result=await S.api('audit_list',{page:historyPage});historyNext=result.hasNext;$('history-list').replaceChildren();for(const event of result.items){const row=document.createElement('div');row.className='user-row';paragraph(row,new Date(event.created_at).toLocaleString('ja-JP')+' ／ '+(labels[event.action] || event.action)+' ／ '+outcomes[event.outcome]);paragraph(row,'操作したアカウントID：'+event.actor);if(event.target)paragraph(row,'対象ID：'+event.target);const detail=event.details || {};if(detail.action)paragraph(row,'操作内容：'+({ban:'永久BAN',unban:'BAN解除',delete:'アカウント削除',...labels}[detail.action] || detail.action));if(detail.from && detail.to)paragraph(row,'対応状況：'+({new:'未対応',checking:'確認中',done:'対応済み'}[detail.from] || detail.from)+' → '+({new:'未対応',checking:'確認中',done:'対応済み'}[detail.to] || detail.to));if(detail.decision)paragraph(row,'公開の操作：'+({stop:'管理者による公開停止',release:'オーナーによる停止解除'}[detail.decision] || detail.decision));if(detail.revision)paragraph(row,'保存後の版：'+detail.revision+' ／ '+(detail.created?'新規作成':'更新'));if(detail.kind)paragraph(row,'削除対象：'+kinds[detail.kind]);if(detail.reason)paragraph(row,'理由：'+detail.reason);if(detail.request_id)paragraph(row,'申請ID：'+detail.request_id);if(detail.operation)paragraph(row,'処理ID：'+detail.operation);if(detail.successful===false)paragraph(row,'外部のアカウント処理は成功していません。');if(!event.protected)row.append(button('この履歴の削除を申請',async()=>{const reason=prompt('履歴を削除したい理由を５〜1000文字で書いてください。');if(reason!==null)await requestDeletion('audit',event.id,reason);},'secondary'));else paragraph(row,'削除できない申請・承認記録');$('history-list').append(row);}if(!result.items.length)paragraph($('history-list'),'履歴はまだありません。');syncPages();}
 async function requests(){const result=await S.api('request_list',{page:requestPage});requestNext=result.hasNext;$('request-list').replaceChildren();for(const r of result.items){const row=document.createElement('div');row.className='user-row';paragraph(row,(kinds[r.kind] || r.kind)+'：'+r.label+' ／ '+({pending:'承認待ち',approved:'承認済み・削除実行済み',rejected:'却下'}[r.status]));paragraph(row,'対象ID：'+r.target);paragraph(row,'申請者ID：'+r.requester+' ／ '+new Date(r.created_at).toLocaleString('ja-JP'));paragraph(row,'申請理由：'+r.reason);if(r.review_reason)paragraph(row,'審査理由：'+r.review_reason+' ／ オーナーID：'+r.reviewer);if(info.owner && r.status==='pending'){async function review(decision){if(decision==='approve' && !mayLeave())return;const reason=prompt((decision==='approve'?'承認':'却下')+'する理由を５〜1000文字で書いてください。');if(reason===null)return;let confirmTarget;if(decision==='approve'){confirmTarget=prompt('削除は元に戻せません。対象のIDを入力してください。\n'+r.target);if(confirmTarget===null)return;if(confirmTarget!==r.target)throw new Error('対象IDが一致しません。');}await S.api('review_delete',{id:r.id,decision,reason:validateReason(reason),confirmTarget});if(decision==='approve' && r.kind==='deck' && deck?.id===r.target)showDeck(null);else if(decision==='approve' && r.kind==='question' && deck)await loadDeck(deck.id);await decks();await requests();await history();note(decision==='approve'?'承認して削除しました。実行記録は残ります。':'申請を却下しました。');}row.append(button('承認して削除',()=>review('approve'),'danger'),button('却下',()=>review('reject'),'secondary'));}$('request-list').append(row);}if(!result.items.length)paragraph($('request-list'),'削除申請はありません。');syncPages();}
 $('request-deck-delete').onclick=()=>run(async()=>{if(!deck)return;await requestDeletion('deck',deck.id,$('delete-deck-reason').value,deck.revision);$('delete-deck-reason').value='';});
 $('history-refresh').onclick=()=>run(history);$('requests-refresh').onclick=()=>run(requests);
 $('history-prev').onclick=()=>run(async()=>{if(historyPage>1){historyPage--;await history();}});$('history-next').onclick=()=>run(async()=>{if(historyNext){historyPage++;await history();}});
 $('requests-prev').onclick=()=>run(async()=>{if(requestPage>1){requestPage--;await requests();}});$('requests-next').onclick=()=>run(async()=>{if(requestNext){requestPage++;await requests();}});

 $('counts').textContent='登録アカウント '+info.accounts+'人 ／ 管理者 '+info.admins+'人'+(info.owner?'（あなたはオーナーです）':'');
 $('new-deck').onclick=()=>run(async()=>{if(mayLeave()){showDeck(null);$('deck-title').focus();}});$('new-question').onclick=()=>run(async()=>{if(mayLeave('question')){showQuestion(null);$('q-prompt').focus();}});
 $('copy-question').onclick=()=>run(async()=>{if(!question || !mayLeave('question'))return;const original=question;showQuestion(null);for(const field of ['prompt','answer','explanation','hint'])$('q-'+field).value=original[field] || '';question={...original,id:null,revision:undefined,position:Number($('q-position').value)-1};questionDirty=true;$('question-title').textContent='問題を複製（未保存）';if(original.image_url){$('q-preview').src=original.image_url;$('q-preview').hidden=false;}note('複製用の入力を作りました。内容を直してから保存してください。');$('q-prompt').focus();});
 $('deck-form').onsubmit=e=>{e.preventDefault();run(async()=>{
  const v={id:deck?.id || null,revision:deck?.revision,published:$('deck-published').checked};for(const f of ['title','description','genre','subject','grade'])v[f]=$('deck-'+f).value.trim();
  const creating=!deck,saved=await S.api('save_deck',v);deckDirty=false;
  if(creating){showDeck({...saved,questions:[]});showQuestion(null);$('q-prompt').focus();}
  else{deck={...saved,questions:deck.questions};$('deck-info').textContent=deck.published?'公開中':'下書き';}
  await decks();await history();note(creating?'デッキを保存しました。続けて１問目を作れます。':'デッキ設定を保存しました。');
 });};
 $('q-image').onchange=()=>{
  questionDirty=true;const file=$('q-image').files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>5242880){$('q-image').value='';note('PNG・JPEG・WebP、５MB以下の画像を選んでください。',true);return;}
  const reader=new FileReader();reader.onload=()=>{if($('q-preview')){$('q-preview').src=reader.result;$('q-preview').hidden=false;}};reader.readAsDataURL(file);
 };
 async function cleanImage(file){
  // Decode and re-encode to remove EXIF/GPS metadata; avoid excessive bitmap sizes.
  const image=await createImageBitmap(file);try{
   if(image.width*image.height>24000000)throw new Error('画像が大きすぎます。小さくしてから選んでください。');
   const scale=Math.min(1,2400/Math.max(image.width,image.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);
   const blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',.9));if(!blob || blob.size>5242880)throw new Error('画像を小さくしてから保存してください。');return new File([blob],'question.webp',{type:'image/webp'});
  }finally{image.close();}
 }
 $('question-form').onsubmit=e=>{e.preventDefault();const next=e.submitter?.value!=='stay';run(async()=>{
  if(!deck)throw new Error('先にデッキを保存してください。');
  const settingsDraft=deckDirty?Object.fromEntries(['title','description','genre','subject','grade'].map(f=>[f,$('deck-'+f).value]).concat([['published',$('deck-published').checked]])):null;
  const deckId=deck.id,v={id:question?.id || null,revision:question?.revision,deck_id:deckId,image_path:$('q-remove-image').checked?null:question?.image_path || null,position:Number($('q-position').value)-1};for(const f of ['prompt','answer','explanation','hint'])v[f]=$('q-'+f).value;
  const file=$('q-image').files[0];if(file){note('画像を保存しています…');v.image_path=(await S.upload(await cleanImage(file))).path;}
  const saved=await S.api('save_question',v);question=saved;questionDirty=false;
  await loadDeck(deckId);if(settingsDraft){for(const f of ['title','description','genre','subject','grade'])$('deck-'+f).value=settingsDraft[f];$('deck-published').checked=settingsDraft.published;deckDirty=true;}if(next){showQuestion(null);$('q-prompt').focus();}else{showQuestion(deck.questions.find(q=>q.id===saved.id) || saved);}
  await decks();await history();note(next?'問題を保存しました。次の問題を入力できます。':'問題を保存しました。この問題を続けて編集できます。');
 });};
 $('question-form').addEventListener('keydown',e=>{if(e.key==='Enter' && (e.ctrlKey || e.metaKey) && !busy){e.preventDefault();$('question-form').requestSubmit($('save-next'));}});
 $('delete-question').onclick=()=>run(async()=>{if(!question)return;const reason=prompt('この問題の削除が必要な理由を５〜1000文字で書いてください。');if(reason===null)return;await requestDeletion('question',question.id,reason,question.revision);});
 $('users-prev').onclick=()=>run(async()=>{if(page>1){page--;await accounts();}});$('users-next').onclick=()=>run(async()=>{page++;await accounts();});
 $('reload').onclick=()=>run(async()=>{if(!mayLeave())return;await decks();await accounts();if(deck)await loadDeck(deck.id);await history();await requests();await accountRequests();note('最新の状態に更新しました。');});
 showDeck(null);await run(async()=>{await decks();await accounts();await history();await requests();await accountRequests();const f=await S.api('feedback_stats');$('feedback-count').textContent='未対応・確認中：'+f.unresolved+'件';note('権限を確認しました。管理機能を利用できます。');});
}
`;

// dependency injection lets the authorization boundaries be checked without a real secret.
export function createHandler(server: any, verifyPassword?: (email:string,password:string,captchaToken?:string)=>Promise<any>, requestSession:string|null=null) {
 async function security(actor:string|null,action='status',sid:string|null=null) {
  const {data,error}=await server.rpc('study_security_service',{p_action:action,p_actor:actor,p_session:sid});
  if(error)throw new Fault(error.code==='42501'?403:503,'管理者の本人確認、または接続設定を確認してください。');
  return data;
 }
 async function dispatch(actor: string | null, action: string, input: any = {}) {
  if(action==='admin_bootstrap' && !(await security(actor,'status',requestSession)).adminVerified)throw new Fault(403,'管理者の本人確認が必要です。管理者確認画面でメールアドレスとパスワードを入力してください。');
  const {data,error} = await server.rpc('study_dispatch',{p_actor:actor,p_action:action,p_input:input});
  if (error) {
   const code = error.code;
   const message = error.message || '';
   if (message.includes('use account request recovery'))throw new Fault(422,'アカウント削除の申請一覧から「処理結果を確認」を使ってください。');
   if (message.includes('deletion request required')) throw new Fault(403,'直接削除できません。理由を付けて削除申請を送ってください。');
   if (message.includes('protected receipt')) throw new Fault(422,'申請・承認の記録は削除できません。');
   if (code === '42501') throw new Fault(403,'このアカウントには利用権限がありません。');
   if (code === 'P0002') throw new Fault(404,'対象が見つかりません。');
   if (code === '40001') throw new Fault(409,'ほかの操作で更新されたか、処理待ちです。再読み込みしてください。');
   if (message.includes('empty deck')) throw new Fault(422,'公開する前に、問題を１問以上保存してください。');
   if (message.includes('admin protected') || message.includes('owner protected')) throw new Fault(422,'自分・管理者・オーナーはこの操作の対象にできません。');
   if (message.includes('recovery not ready')) throw new Fault(422,'処理待ち解除は、操作開始から15分後にできます。');
   if (['22023','23514','23502','22P02'].includes(code)) throw new Fault(422,'入力内容と対象アカウントを確認してください。');
   throw new Fault(500,'保存できませんでした。SQLの設定を確認してください。');
  }
  return data;
 }
 async function community(actor:string|null,action:string,input:any={}){
  const {data,error}=await server.rpc('study_community',{p_actor:actor,p_action:action,p_input:input});
  if(error){
   if(error.code==='42501')throw new Fault(403,'ログイン・メール確認・利用権限を確認してください。');
   if(error.code==='P0002')throw new Fault(404,'公開されていないか、デッキが見つかりません。');
   if(error.code==='40001'||error.code==='23505')throw new Fault(409,'更新済み・通報済みです。最新の状態を開き直してください。');
   if(error.code==='P0001')throw new Fault(429,'通報の受付上限です。１分以上あけ、１日５回まででお願いします。');
   if(['22023','23514','23502','22P02'].includes(error.code))throw new Fault(422,'理由・公開確認・問題数を確認してください。管理者による公開停止中は再公開できません。');
   throw new Fault(500,'処理を保存できません。公開デッキ用SQLの設定を確認してください。');
  }return data;
 }
 async function personal(actor:string|null,action:string,input:any={}) {
  const {data,error}=await server.rpc('study_personal',{p_actor:actor,p_action:action,p_input:input});
  if(error){
   if(error.code==='42501')throw new Fault(403,'ログインと利用権限を確認してください。');
   if(error.code==='P0002')throw new Fault(404,'自分のデッキ・問題が見つかりません。');
   if(error.code==='40001' || error.code==='23505')throw new Fault(409,'保存済みか更新されています。入力を控えてから最新の状態を開いてください。');
   if(error.code==='P0001')throw new Fault(422,'自分のデッキは10個、問題は１デッキ150問までです。');
   if(['22023','23514','23502','22P02'].includes(error.code))throw new Fault(422,'必須欄・文字数・並び順を確認してください。');
   throw new Fault(500,'保存できません。個人デッキ用SQLの設定を確認してください。');
  }return data;
 }
 async function points(actor:string|null,action:string,input:any={}){
  const {data,error}=await server.rpc('study_points',{p_actor:actor,p_action:action,p_input:input});
  if(error){
   if(error.code==='42501')throw new Fault(403,'ログイン・メール確認・利用権限を確認してください。');
   if(error.code==='P0002')throw new Fault(404,'学習できるデッキ・問題が見つかりません。');
   if(error.code==='40001'||error.code==='23505')throw new Fault(409,'ポイントが更新されています。最新のポイントを確認してください。');
   if(error.code==='P0001')throw new Fault(429,'今日のアイテム交換上限です。明日またお試しください。');
   if(['22023','23514','23502','22P02'].includes(error.code))throw new Fault(422,'ポイントが足りないか、アイテムを使用中・交換済みです。入力と残高を確認してください。');
   throw new Fault(500,'ポイントを保存できません。ポイント用SQLの設定を確認してください。');
  }return data;
 }
 async function account(actor:string|null,action:string,input:any={}){
  const {data,error}=await server.rpc('study_account',{p_actor:actor,p_action:action,p_input:input});
  if(error){
   if(error.code==='42501')throw new Fault(403,'利用権限を確認してください。オーナー・管理者は本人削除もできません。');
   if(error.code==='P0002')throw new Fault(404,'対象が見つかりません。');
   if(error.code==='40001' || error.code==='23505')throw new Fault(409,'申請済みか、ほかの処理が進んでいます。最新の状態に更新してください。');
   if(['22023','23514','23502','22P02'].includes(error.code))throw new Fault(422,'理由・対象・確認入力を確認してください。');
   throw new Fault(500,'アカウント処理を保存できません。SQLの設定を確認してください。');
  }return data;
 }
 async function removeAccount(target:string,finalize:(ok:boolean)=>Promise<any>){
  let ok=false;
  try{const result=await server.auth.admin.deleteUser(target);ok=!result.error;}catch{/* keep blocked */}
  try{await finalize(ok);}catch{if(ok)return {ok:true,receiptPending:true};throw new Fault(500,'削除処理を確定できませんでした。アカウントは利用停止のままです。オーナーに確認してください。');}
  if(!ok)throw new Fault(502,'認証サービス側で削除できませんでした。アカウントは利用停止のままです。オーナーが確認してください。');
  return {ok:true,receiptPending:false};
 }
 async function feedback(actor: string | null, action: string, input: any = {}) {
  const {data,error}=await server.rpc('study_feedback',{p_actor:actor,p_action:action,p_input:{...input,_session:requestSession}});
  if(error){
   if(error.code==='42501')throw new Fault(403,'ログインと利用権限を確認してください。');
   if(error.code==='P0002')throw new Fault(404,'フィードバックが見つかりません。');
   if(error.code==='40001')throw new Fault(409,'更新されています。最新の状態に読み直してください。');
   if(['22023','23514','23502','22P02'].includes(error.code))throw new Fault(422,'内容・画像・文字数を確認してください。');
   throw new Fault(500,'フィードバックを保存できません。SQLの設定を確認してください。');
  }
  return data;
 }
 async function feedbackGate(actor: string | null){if(!(await feedback(actor,'gate')).allowed)throw new Fault(429,'操作が多すぎます。１分ほど待ってください。');}
 async function feedbackSubmit(req: Request, actor: string | null){
  await feedbackGate(actor);
  if(Number(req.headers.get('Content-Length') || 0)>6400000)throw new Fault(413,'画像は３枚・合計６MBまでです。');
  const bytes=await readBody(req,6400000);
  let form: FormData;try{form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('Content-Type')!}}).formData();}catch{throw new Fault(422,'送信形式を確認してください。');}
  if([...form.keys()].some(k=>!['category','body','images'].includes(k)) || form.getAll('category').length!==1 || form.getAll('body').length!==1)throw new Fault(422,'送信形式を確認してください。');
  const body=text(form.get('body'),2000,true).trim(),category=text(form.get('category'),10,true);
  if(body.length<10 || !['bug','idea','other'].includes(category))throw new Fault(422,'内容を10〜2000文字で具体的に書いてください。');
  if(/^(.)\1{7,}$/us.test(body.replace(/\s/g,'')))throw new Fault(422,'同じ文字の繰り返しではなく、内容を書いてください。');
  const files=form.getAll('images');if(files.length>3)throw new Fault(422,'画像は１回３枚までです。');
  const fid=crypto.randomUUID(),uploads:any[]=[];let total=0;
  for(const file of files){
   if(!(file instanceof File) || file.size<12 || file.size>2097152)throw new Fault(422,'画像は１枚２MBまでです。');
   const b=new Uint8Array(await file.arrayBuffer());let ext='',mime='';
   if([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)){ext='png';mime='image/png';}
   else if(b[0]===255 && b[1]===216 && b[2]===255){ext='jpg';mime='image/jpeg';}
   else if(new TextDecoder().decode(b.slice(0,4))==='RIFF' && new TextDecoder().decode(b.slice(8,12))==='WEBP'){ext='webp';mime='image/webp';}
   if(!ext || file.type!==mime)throw new Fault(422,'PNG・JPEG・WebPの画像を選んでください。');
   total+=file.size;uploads.push({path:actor+'/'+fid+'/'+crypto.randomUUID()+'.'+ext,size:file.size,mime,bytes:b});
  }
  const reserved=await feedback(actor,'reserve',{id:fid,category,body,images:uploads.map(({path,size})=>({path,size})),image_bytes:total});
  if(reserved.limited)throw new Fault(429,'送信上限に達しました。１分以上あけ、１日５回まででお願いします。全体の受付上限の場合は後日試してください。');
  try{
   for(const file of uploads){const {error}=await server.storage.from('study-feedback').upload(file.path,file.bytes,{contentType:file.mime,upsert:false});if(error)throw new Fault(502,'画像を保存できませんでした。入力は残っています。時間をあけて再送してください。');}
   await feedback(actor,'finish',{id:fid});return {id:fid};
  }catch(e){
   try{if(uploads.length)await server.storage.from('study-feedback').remove(uploads.map(x=>x.path));}catch{/* reservation keeps storage quota bounded */}
   try{await feedback(actor,'cancel',{id:fid});}catch{/* hidden uploading state remains on interruption */}
   throw e;
  }
 }
 async function gate(actor: string | null, scope: string) {
  if (!(await dispatch(actor,'rate_gate',{scope})).allowed) throw new Fault(429,'短時間の操作が多すぎます。１分ほど待ってから試してください。');
 }
 async function signedDeck(deck: any) {
  for (const q of deck.questions || []) {
   if (!q.image_path) { q.image_url = null; continue; }
   const {data,error} = await server.storage.from('study-images').createSignedUrl(q.image_path,3600);
   q.image_url = error ? null : data.signedUrl;
  }
  return deck;
 }
 return async (req: Request) => {
  if(requestSession===null && req.headers.get('Authorization')?.startsWith('Bearer ')){
   const token=req.headers.get('Authorization')!.slice(7);
   const checked=await server.auth.getUser(token);
   if(!checked.error && checked.data.user){
    let sid=null;try{const p=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(typeof p.session_id==='string'&&UUID.test(p.session_id))sid=p.session_id;}catch{/* reject missing session below */}
    if(sid)return createHandler(server,verifyPassword,sid)(req);
   }
  }
  const origin = req.headers.get('Origin');
  const headers = {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
  const response = (body: any, status = 200) => new Response(JSON.stringify(body),{status,headers});
  let actor: string | null = null, authenticatedUser:any=null, attempted = '', authorized = false;
  try {
   if (origin && origin !== ORIGIN) throw new Fault(403,'許可されていない接続元です。');
   if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
   if (req.method !== 'POST') throw new Fault(405,'この操作はPOSTを使います。');
   const auth = req.headers.get('Authorization');
   if (auth) {
    if (!/^Bearer [^\s]+$/.test(auth)) throw new Fault(401,'ログインし直してください。');
    const {data,error} = await server.auth.getUser(auth.slice(7));
    if (error || !data.user) throw new Fault(401,'ログインし直してください。');
    actor = data.user.id;authenticatedUser=data.user;
   }
   const access=await security(actor,'status',requestSession);
   if(!access.allowed)throw new Fault(503,access.message || '現在メンテナンス中です。');
   if ((req.headers.get('Content-Type') || '').startsWith('multipart/form-data') && new URL(req.url).searchParams.get('action')==='feedback_submit') {
    return response({data:await feedbackSubmit(req,actor)});
   }
   if ((req.headers.get('Content-Type') || '').startsWith('multipart/form-data')) {
    await dispatch(actor,'admin_bootstrap');authorized=true;attempted='upload';
    await gate(actor,'admin');await gate(actor,'upload');
    const declared = Number(req.headers.get('Content-Length') || 0);
    if (declared > 5500000) throw new Fault(413,'画像は５MB以下にしてください。');
    const bytes = await readBody(req,5500000);
    const form = await new Response(bytes,{headers:{'Content-Type':req.headers.get('Content-Type')!}}).formData(), file = form.get('image');
    if (!(file instanceof File) || file.size < 12 || file.size > 5242880) throw new Fault(422,'５MB以下の画像を選んでください。');
    const b = new Uint8Array(await file.arrayBuffer());
    let ext = '', mime = '';
    if ([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)) { ext='png';mime='image/png'; }
    else if (b[0]===255 && b[1]===216 && b[2]===255) {ext='jpg';mime='image/jpeg';}
    else if (new TextDecoder().decode(b.slice(0,4))==='RIFF' && new TextDecoder().decode(b.slice(8,12))==='WEBP') {ext='webp';mime='image/webp';}
    if (!ext || mime !== file.type) throw new Fault(422,'PNG・JPEG・WebPの画像を選んでください。');
    const path = `${crypto.randomUUID()}.${ext}`;
    await dispatch(actor,'upload_started',{path});
    const {error} = await server.storage.from('study-images').upload(path,b,{contentType:mime,upsert:false});
    if (error) throw new Fault(500,'画像を保存できません。Storageの設定を確認してください。');
    try {await dispatch(actor,'upload_finished',{path});} catch(e) {await server.storage.from('study-images').remove([path]);throw e;}
    const {data,error:signError} = await server.storage.from('study-images').createSignedUrl(path,3600);
    return response({data:{path,url:signError?null:data.signedUrl}});
   }
   const declared = Number(req.headers.get('Content-Length') || 0);
   if (declared > 65536) throw new Fault(413,'入力が大きすぎます。');
   const raw = new TextDecoder().decode(await readBody(req,65536));
   if (raw.length > 65536) throw new Fault(413,'入力が大きすぎます。');
   let body: any; try {body = JSON.parse(raw);} catch {throw new Fault(422,'リクエストの形式が正しくありません。');}
   if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Fault(422,'リクエストの形式が正しくありません。');
   const action = body.action, input = body.input ?? {};
   if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Fault(422,'入力の形式が正しくありません。');
   const attackSignal=securityAttackSignal(action,input,actor);
   if(attackSignal){
    if(actor && requestSession){
     const {error:guardError}=await server.rpc('study_security_guard_signal',{p_actor:actor,p_session:requestSession,p_signal:attackSignal});
     if(guardError)throw new Fault(503,'不正な要求を拒否しました。接続設定を確認してください。');
    }
    throw new Fault(403,'不正な操作を拒否しました。');
   }
   if(action==='admin_verify'||action==='admin_password_set'){
    if(!actor || !authenticatedUser?.email || !requestSession)throw new Fault(401,'先にアカウント画面でログインしてください。');
    const rate=await security(actor,'rate',requestSession);
    if(!rate.allowed)throw new Fault(429,'確認回数の上限です。15分ほど待ってからお試しください。');
    const email=text(input.email,254,true).trim().toLowerCase(),password=text(input.password,128,true);
    if(email!==authenticatedUser.email.toLowerCase())throw new Fault(403,'ログイン中の管理者のメールアドレスを入力してください。');
    const verified=verifyPassword?await verifyPassword(email,password,input.captchaToken===undefined?undefined:text(input.captchaToken,8192,true)):null;
    if(!verified || verified.id!==actor)throw new Fault(403,'メールアドレスかパスワードを確認してください。');
    const state=await security(actor,'status',requestSession);
    if(action==='admin_password_set'&&!state.owner)throw new Fault(403,'専用パスワードを設定できるのはオーナーだけです。');
    const dedicated=text(input.adminPassword,64,true);
    const bytes=new TextEncoder().encode(dedicated).length;
    if(bytes<16||bytes>64)throw new Fault(422,'専用パスワードは16〜64バイトで入力してください。');
    if(action==='admin_password_set'&&dedicated===password)throw new Fault(422,'アカウントとは別のパスワードにしてください。');
    const {data:result,error:passwordError}=await server.rpc('study_admin_password_service',{
     p_action:action==='admin_password_set'?'set':'verify',p_actor:actor,p_session:requestSession,
     p_password:dedicated,p_revision:action==='admin_password_set'?input.revision:null
    });
    if(passwordError)throw new Fault(passwordError.code==='40001'?409:403,passwordError.code==='40001'?'別の操作で変更されています。画面を開き直してください。':'専用パスワードを確認できませんでした。');
    if(!result?.verified)throw new Fault(403,'管理者専用パスワードが違うか、まだ設定されていません。');
    return response({data:result.status});
   }
   if(['points_wallet','points_claim','points_buy','points_preference'].includes(action)){
    if(!(await points(actor,'gate')).allowed)throw new Fault(429,'ポイントの操作が多すぎます。１分ほど待ってください。');
    if(action==='points_wallet')return response({data:await points(actor,'wallet')});
    if(action==='points_claim'){
     if(!['official','personal','community'].includes(input.source))throw new Fault(422,'デッキの種類を確認してください。');
     if(input.rating!==undefined&&!['learned','again'].includes(input.rating))throw new Fault(422,'カードの判定を確認してください。');
     return response({data:await points(actor,'claim',{source:input.source,deck_id:id(input.deck_id),question_id:id(input.question_id),rating:input.rating??'again'})});
    }
    if(!Number.isSafeInteger(input.revision)||input.revision<1)throw new Fault(422,'最新のポイントを確認してください。');
    if(action==='points_buy'){
     if(!['booster','auto_hint'].includes(input.item))throw new Fault(422,'交換するアイテムを確認してください。');
     return response({data:await points(actor,'buy',{id:id(input.id),item:input.item,revision:input.revision})});
    }
    if(typeof input.auto_hint!=='boolean')throw new Fault(422,'ヒントの設定を確認してください。');
    return response({data:await points(actor,'preference',{auto_hint:input.auto_hint,revision:input.revision})});
   }
   if (action === 'public_decks') return response({data:await dispatch(actor,action)});
   if (action === 'public_deck') return response({data:await signedDeck(await dispatch(actor,action,{id:id(input.id)}))});
   if(typeof action==='string' && action.startsWith('community_')){
    if(['community_list','community_admin_list','community_reports'].includes(action) && (!Number.isInteger(input.page)||input.page<1||input.page>10000))throw new Fault(422,'ページ番号を確認してください。');
    if(action==='community_list')return response({data:await community(actor,'list',{page:input.page})});
    if(action==='community_deck')return response({data:await community(actor,'get',{id:id(input.id)})});
    if(['community_publish','community_unpublish','community_report'].includes(action)){
     if(!(await community(actor,'gate')).allowed)throw new Fault(429,'操作が多すぎます。１分ほど待ってください。');
     if(!Number.isInteger(input.publication_revision)||input.publication_revision<0)throw new Fault(422,'公開状態を開き直してください。');
     const target=id(input.id);
     if(action==='community_report')return response({data:await community(actor,'report',{id:target,publication_revision:input.publication_revision,reason:text(input.reason,1000,true).trim()})});
     if(action==='community_unpublish')return response({data:await community(actor,'unpublish',{id:target,publication_revision:input.publication_revision})});
     if(input.confirm!=='公開する'||!Number.isInteger(input.revision)||input.revision<1||!Array.isArray(input.question_versions)||input.question_versions.length>150)throw new Fault(422,'公開前の確認をやり直してください。');
     const versions=input.question_versions.map((q:any)=>{if(!q||!Number.isInteger(q.revision)||q.revision<1)throw new Fault(422,'問題を開き直してください。');return {id:id(q.id),revision:q.revision};});
     return response({data:await community(actor,'publish',{id:target,publication_revision:input.publication_revision,revision:input.revision,confirm:input.confirm,question_versions:versions})});
    }
    await dispatch(actor,'admin_bootstrap');authorized=true;attempted=action;await gate(actor,'admin');
    if(action==='community_admin_list')return response({data:await community(actor,'admin_list',{page:input.page})});
    if(action==='community_reports')return response({data:await community(actor,'reports',{page:input.page})});
    if(action==='community_admin_deck')return response({data:await community(actor,'admin_get',{id:id(input.id)})});
    if(['community_moderate','community_resolve_report'].includes(action)){
     await gate(actor,'write');if(!Number.isInteger(input.revision)||input.revision<1)throw new Fault(422,'最新の状態で操作してください。');
     const v={id:id(input.id),revision:input.revision,reason:text(input.reason,1000,true).trim(),decision:input.decision};
     if(action==='community_moderate'&&!['stop','release'].includes(input.decision))throw new Fault(422,'停止・解除を選んでください。');
     return response({data:await community(actor,action==='community_moderate'?'moderate':'resolve_report',v)});
    }
    throw new Fault(422,'操作が見つかりません。');
   }
   if(['personal_decks','personal_deck','personal_save_deck','personal_save_question','personal_delete_deck','personal_delete_question','personal_copy_community'].includes(action)) {
    const write=!['personal_decks','personal_deck'].includes(action);
    if(!(await personal(actor,'gate',{scope:write?'write':'read'})).allowed)throw new Fault(429,'操作が多すぎます。１分ほど待ってください。');
    if(action==='personal_decks')return response({data:await personal(actor,'list')});
    if(action==='personal_deck')return response({data:await personal(actor,'get',{id:id(input.id)})});
    if(action==='personal_copy_community'){
     if(!Number.isInteger(input.publication_revision)||input.publication_revision<1)throw new Fault(422,'公開デッキを開き直してください。');
     return response({data:await personal(actor,'copy_community',{id:id(input.id),new_id:id(input.new_id),publication_revision:input.publication_revision})});
    }
    if(action==='personal_delete_deck'||action==='personal_delete_question'){
     if(input.confirm!=='削除する'||!Number.isInteger(input.revision)||input.revision<1)throw new Fault(422,'削除の確認をやり直してください。');
     if(action==='personal_delete_question')return response({data:await personal(actor,'delete_question',{id:id(input.id),deck_id:id(input.deck_id),revision:input.revision,confirm:input.confirm})});
     if(!Number.isInteger(input.publication_revision)||input.publication_revision<0||!Array.isArray(input.question_versions)||input.question_versions.length>150)throw new Fault(422,'デッキを開き直してください。');
     const versions=input.question_versions.map((q:any)=>{if(!q||!Number.isInteger(q.revision)||q.revision<1)throw new Fault(422,'問題を開き直してください。');return {id:id(q.id),revision:q.revision};});
     return response({data:await personal(actor,'delete_deck',{id:id(input.id),revision:input.revision,publication_revision:input.publication_revision,question_versions:versions,confirm:input.confirm})});
    }
    if(!Number.isInteger(input.revision) || input.revision<0)throw new Fault(422,'最新の状態で編集してください。');
    if(action==='personal_save_deck')return response({data:await personal(actor,'save_deck',{id:id(input.id),revision:input.revision,title:text(input.title,100,true),description:text(input.description,1000),genre:text(input.genre,40,true),subject:text(input.subject,40,true),grade:text(input.grade,40,true)})});
    if(!Number.isInteger(input.position) || input.position<0 || input.position>149)throw new Fault(422,'並び順は１〜150で指定してください。');
    return response({data:await personal(actor,'save_question',{id:id(input.id),deck_id:id(input.deck_id),revision:input.revision,prompt:text(input.prompt,4000,true),answer:text(input.answer,4000,true),explanation:text(input.explanation,8000),hint:text(input.hint,2000),position:input.position})});
   }
   if(action==='account_self_info')return response({data:await account(actor,'self_info')});
   if(action==='account_self_delete'){
    if(!(await account(actor,'self_gate')).allowed)throw new Fault(429,'確認が続いています。１分ほど待ってください。');
    const info=await account(actor,'self_info');
    if(!info.canDelete)throw new Fault(403,'オーナー・管理者のアカウントは本人削除できません。');
    if(input.confirm!=='削除する')throw new Fault(422,'確認欄に「削除する」と入力してください。');
    const password=text(input.password,128,true);
    if(!authenticatedUser?.email || !verifyPassword)throw new Fault(422,'メールとパスワードのログインが必要です。');
    if(authenticatedUser.factors?.some((f:any)=>f.status==='verified'))throw new Fault(403,'追加の認証が設定されています。オーナーに削除申請を依頼してください。');
    const verified=await verifyPassword(authenticatedUser.email,password,input.captchaToken===undefined?undefined:text(input.captchaToken,8192,true));
    if(!verified || verified.id!==actor)throw new Fault(401,'現在のパスワードを確認してください。');
    const {operation}=await account(actor,'begin_self',{confirm:'削除する'});
    return response({data:await removeAccount(actor!,ok=>account(actor,'finish_self',{operation,successful:ok}))});
   }
   if(['account_request_delete','account_requests','account_review_delete','account_recover_request','account_recover_self'].includes(action)){
    const info=await dispatch(actor,'admin_bootstrap');authorized=true;attempted=action;await gate(actor,'admin');
    if(action==='account_requests'){
     if(!Number.isInteger(input.page) || input.page<1 || input.page>10000)throw new Fault(422,'ページ番号を確認してください。');
     return response({data:await account(actor,'list',{page:input.page})});
    }
    await gate(actor,'write');
    if(action==='account_request_delete'){
     await gate(actor,'request');
     return response({data:await account(actor,'request',{target:id(input.target),reason:text(input.reason,1000,true).trim()})});
    }
    if(!info.owner)throw new Fault(403,'オーナーだけが承認・却下・処理確認できます。');
    if(action==='account_recover_self')return response({data:await account(actor,'recover_self',{id:id(input.id)})});
    if(action==='account_recover_request')return response({data:await account(actor,'recover_request',{id:id(input.id)})});
    if(!['approve','reject'].includes(input.decision))throw new Fault(422,'承認・却下を選んでください。');
    const result=await account(actor,'review',{id:id(input.id),decision:input.decision,reason:text(input.reason,1000,true).trim(),confirmTarget:input.decision==='approve'?id(input.confirmTarget):null});
    if(input.decision==='reject')return response({data:{ok:true}});
    return response({data:await removeAccount(result.target,ok=>account(actor,'finish_admin',{id:input.id,operation:result.operation,successful:ok}))});
   }
   if(typeof action==='string' && action.startsWith('feedback_')){
    await feedbackGate(actor);
    if(action==='feedback_stats')return response({data:await feedback(actor,'stats')});
    if(action==='feedback_list'){
     if(!Number.isInteger(input.page) || input.page<1 || input.page>10000)throw new Fault(422,'ページ番号を確認してください。');
     return response({data:await feedback(actor,'list',{page:input.page,admin:input.admin===true})});
    }
    if(action==='feedback_detail'){
     const detail=await feedback(actor,'detail',{id:id(input.id)});
     detail.images=await Promise.all(detail.images.map(async (img:any)=>{const {data,error}=await server.storage.from('study-feedback').createSignedUrl(img.path,60);return {url:error?null:data.signedUrl};}));
     return response({data:detail});
    }
    if(action==='feedback_status'){
     await dispatch(actor,'admin_bootstrap');authorized=true;attempted='feedback_status';await gate(actor,'write');
     if(!['new','checking','done'].includes(input.status) || !Number.isInteger(input.revision))throw new Fault(422,'対応状況を確認してください。');
     return response({data:await feedback(actor,'status',{id:id(input.id),status:input.status,revision:input.revision})});
    }
    throw new Fault(422,'対応していない操作です。');
   }
   // EVERY remaining action is authorized here, even malformed or forged requests.
   const info = await dispatch(actor,'admin_bootstrap');authorized=true;
   attempted=typeof action==='string'?action:'';
   await gate(actor,'admin');
   if (['save_deck','save_question','add_admin','remove_admin','ban','unban','delete','recover_account','review_delete'].includes(action)) await gate(actor,'write');
   if (action==='request_delete') await gate(actor,'request');
   if (action === 'admin_bootstrap') return response({data:{...info,html:ADMIN_HTML+(info.owner?OWNER_HTML:''),script:ADMIN_SCRIPT}});
   if (action === 'admin_decks') return response({data:await dispatch(actor,action)});
   if (action === 'admin_deck') return response({data:await signedDeck(await dispatch(actor,action,{id:id(input.id)}))});
   if (action === 'save_deck') {
    const v:any = {id:input.id?id(input.id):null,revision:input.revision,title:text(input.title,100,true),description:text(input.description,1000),genre:text(input.genre,40,true),subject:text(input.subject,40,true),grade:text(input.grade,40,true),published:input.published===true};
    revision(v); return response({data:await dispatch(actor,action,v)});
   }
   if (action === 'save_question') {
    const v:any = {id:input.id?id(input.id):null,deck_id:id(input.deck_id),revision:input.revision,prompt:text(input.prompt,4000,true),answer:text(input.answer,4000,true),explanation:text(input.explanation,8000),hint:text(input.hint,2000),image_path:input.image_path || null,position:input.position};
    if (v.image_path && (typeof v.image_path !== 'string' || !IMAGE.test(v.image_path))) throw new Fault(422,'画像を選び直してください。');
    if (!Number.isInteger(v.position) || v.position<0 || v.position>10000) throw new Fault(422,'並び順は０〜10000の整数にしてください。');
    revision(v);return response({data:await dispatch(actor,action,v)});
   }
   if (['delete_question','delete_deck','delete_audit'].includes(action)) throw new Fault(403,'直接削除できません。理由を付けて削除申請を送ってください。');
   if (['audit_list','request_list'].includes(action)) {
    if (!Number.isInteger(input.page) || input.page<1 || input.page>100000) throw new Fault(422,'ページ番号を確認してください。');
    return response({data:await dispatch(actor,action,{page:input.page})});
   }
   if (action==='request_delete') {
    if (!['deck','question','audit'].includes(input.kind)) throw new Fault(422,'削除対象を確認してください。');
    if (input.kind!=='audit' && (!Number.isInteger(input.revision) || input.revision<1)) throw new Fault(422,'最新の状態に更新してください。');
    return response({data:await dispatch(actor,action,{kind:input.kind,target:id(input.target),reason:text(input.reason,1000,true).trim(),revision:input.revision})});
   }
   if (action==='review_delete') {
    if (!info.owner) throw new Fault(403,'オーナーだけが承認・却下できます。');
    if (!['approve','reject'].includes(input.decision)) throw new Fault(422,'承認・却下を選んでください。');
    return response({data:await dispatch(actor,action,{id:id(input.id),decision:input.decision,reason:text(input.reason,1000,true).trim(),confirmTarget:input.decision==='approve'?id(input.confirmTarget):null})});
   }
   if (action === 'users') {
    if (!Number.isInteger(input.page) || input.page<1 || input.page>100000) throw new Fault(422,'ページ番号が正しくありません。');
    const {data,error} = await server.auth.admin.listUsers({page:input.page,perPage:20});
    if (error) throw new Fault(500,'アカウント一覧を取得できませんでした。');
    const users = data.users || [], states = await dispatch(actor,'users_state',{ids:users.map((u:any)=>u.id)});
    return response({data:{users:users.map((u:any)=>({id:u.id,...(info.owner?{email:u.email || ''}:{}),confirmed:!!u.email_confirmed_at,created_at:u.created_at,...states.find((s:any)=>s.id===u.id)})),hasNext:users.length===20}});
   }
   if(action==='delete')throw new Fault(403,'理由を付けて削除申請を送り、オーナーの承認を待ってください。');
   if (['add_admin','remove_admin','ban','unban','recover_account'].includes(action)) {
    const target = id(input.target);
    if (['add_admin','remove_admin','recover_account','delete'].includes(action) && !info.owner) throw new Fault(403,'オーナーだけが実行できます。');
    const {data,error} = await server.auth.admin.getUserById(target);
    if (error || !data.user) throw new Fault(404,'対象のアカウントが見つかりません。');
    if (info.owner ? (!data.user.email || input.confirmEmail !== data.user.email) : input.confirmTarget !== target) throw new Fault(422,'確認入力が一致していません。');
    if (['add_admin','remove_admin','recover_account'].includes(action)) return response({data:await dispatch(actor,action,{target})});
    const {operation} = await dispatch(actor,'begin_account',{target,action});
    let success = false;
    try {
     const result = action==='delete' ? await server.auth.admin.deleteUser(target) : await server.auth.admin.updateUserById(target,{ban_duration:action==='ban'?'876000h':'none'});
     if (result.error) throw new Fault(502,'認証サービス側の操作に失敗しました。利用停止は維持されます。再読み込みし、必要ならBAN解除で復旧してください。');
     success = true;
    } finally {
     // If a timeout interrupts this finalization, the account stays blocked.
     await dispatch(actor,'finish_account',{operation,successful:success});
    }
    return response({data:{ok:true}});
   }
   throw new Fault(422,'対応していない操作です。');
  } catch (e) {
   if (authorized && ['save_deck','save_question','request_delete','review_delete','add_admin','remove_admin','ban','unban','delete','recover_account','upload','feedback_status','account_request_delete','account_review_delete','account_recover_request','account_recover_self'].includes(attempted) && !(e instanceof Fault && e.status===429)) {
    try {if(attempted.startsWith('account_'))await account(actor,'failed_admin',{action:attempted});else if(attempted==='feedback_status')await feedback(actor,'failed_status');else await dispatch(actor,'failed_action',{action:attempted});} catch { /* fail closed, no sensitive data in logs */ }
   }
   if (e instanceof Fault) return response({error:e.message},e.status);
   console.error('study-api request failed');
   return response({error:'処理を完了できませんでした。通信とサーバー設定を確認してください。'},500);
  }
 };
}
// Supabase runtime entry point
{
 const url = Deno.env.get('SUPABASE_URL');
 let key: string | undefined;
 try {key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;} catch { /* legacy fallback */ }
 key ||= Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if (!url || !key) throw new Error('Supabase server environment is missing');
 const server = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 Deno.serve(createHandler(server,async(email,password,captchaToken)=>{
  // A separate Auth client prevents reauthentication from replacing the service-role session.
  const verifier=createClient(url,key!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await verifier.auth.signInWithPassword({email,password,...(captchaToken?{options:{captchaToken}}:{})});
  if(error || !data.user)return null;
  try{await verifier.auth.signOut({scope:'local'});}catch{/* short-lived reauthentication session */}
  return data.user;
 }));
}
