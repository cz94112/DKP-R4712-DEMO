import {deviceVault} from './device-vault.js';
import {syncOne,syncBatch} from './batch-sync.js';
import {prepareAutoBatch,createApprovedBatch} from './auto-batch.js';
import {createAutoSync} from './auto-sync.js';
import {createEditStore,beginEdit,reviseEdit,compareBase,inspectConflict} from './offline-edits.js';
const $=s=>document.querySelector(s), set=(s,v)=>{$(s).textContent=v};
const results=new Map();
const store=createEditStore();let snapshot=null,current=null,existing=false,busy=false,generation=0,native=false,sendDraft=null,readLatest=null,autoReady=()=>false;
const auto=createAutoSync({ready:()=>native&&deviceVault.ready()&&!busy&&!document.hidden&&navigator.onLine!==false&&autoReady(),send:async action=>{busy=true;$('#editSave').disabled=true;try{return await action()}finally{busy=false;$('#editSave').disabled=false;try{await refresh()}catch{}}},onStatus:s=>set('#autoStatus',s)});
export function configureAutoReady(fn){autoReady=fn;}
export function cancelAutoSync(){generation++;auto.cancel();}

function lock(){generation++;current=null;existing=false;$('#editForm').hidden=true;$('#editDue').value='';$('#editNote').value='';set('#editBase','');}
function message(s){set('#editStatus',s)}
function button(label,fn){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.disabled=busy||!deviceVault.ready();b.addEventListener('click',fn);return b;}
async function refresh(){
 const ids=await store.list();const host=$('#editList');host.replaceChildren();$('#syncAll').disabled=busy||!native||!deviceVault.ready()||!ids.length;$('#autoAll').disabled=$('#syncAll').disabled;
 for(const id of ids){const row=document.createElement('div');row.className='vehicle';const meta=document.createElement('div');meta.textContent=id.toUpperCase()+' · '+(results.get(id)||'Bản nháp lưu trên iPhone');const more=document.createElement('details');more.className='advanced draft-more';const summary=document.createElement('summary');summary.textContent='Thao tác khác';const actions=document.createElement('div');actions.className='actions';actions.append(button('Tự gửi khi có mạng',()=>armAuto(id)),button('Đối chiếu / giữ hạn nháp',()=>reconcile(id,'draft')),button('Dùng hạn Windows',()=>reconcile(id,'windows')),button('Lịch sử đối chiếu',()=>showHistory(id)),button('Xóa',()=>remove(id)));more.append(summary,actions);row.append(meta,button('Mở / sửa',()=>load(id)),button('Gửi hạn đăng kiểm',()=>send(id)),more);host.append(row)}
 if(!ids.length)host.textContent='Chưa có bản nháp từ hồ sơ Windows.';
}
function render(d,isExisting){current=d;existing=isExisting;$('#editForm').hidden=false;$('#editDue').value=d.editedDue;$('#editNote').value=d.note;
 let meta=`${d.id.toUpperCase()} · revision gốc ${d.baseRevision} · hạn gốc ${d.baseDue||'chưa có'}`;
 if(snapshot&&!compareBase(d,snapshot))meta+=' · Bản gốc khác bản sao đang mở; giữ nguyên căn cứ, chưa đồng bộ.';
 set('#editBase',meta);$('#editForm').scrollIntoView({block:'start',behavior:'auto'});$('#editHeading').focus({preventScroll:true});}
async function task(fn){if(busy||!native)return;if(!deviceVault.ready()){message('Cần đăng nhập để mở kho mã hóa.');return;}auto.cancel();busy=true;$('#editSave').disabled=true;$('#syncAll').disabled=true;$('#autoAll').disabled=true;try{await fn()}catch(e){message(e.message||'Không xử lý được bản nháp.')}finally{busy=false;$('#editSave').disabled=false;try{await refresh()}catch{message('Không đọc được danh sách bản nháp.')}}}
function pass(){return deviceVault.secret();}
function load(id){const p=pass();lock();const g=generation;task(async()=>{const d=await store.load(p,id);const confirmed=await store.confirmed(p,id),pending=await store.pending(p,id);if(g===generation){render(d,true);message(pending?'Chưa rõ kết quả lần gửi. Chọn Gửi hạn đăng kiểm để kiểm tra lại cùng thao tác. Không sửa/xóa trước khi có kết quả.':confirmed?'Đã có xác nhận Windows. Ghi chú vẫn cục bộ.':'Đã mở bản nháp. Có thể lưu hoặc gửi không cần mật khẩu phụ.')}})}
function remove(id){if(busy||!confirm(`Xóa bản nháp ${id.toUpperCase()} trên iPhone?`))return;const p=pass();lock();task(async()=>{await store.remove(p,id);results.delete(id);message('Đã xóa bản nháp cục bộ. Không đổi Windows.');})}
export function setEditSnapshot(s){snapshot=s;if(!s)lock();}
export function editButton(id){return button('Chỉnh sửa ngoại tuyến',()=>{if(busy||!snapshot){message('Mở lại bản sao hồ sơ trước khi chỉnh sửa.');$('#editStatus').scrollIntoView({block:'center'});return;}message('Đang mở '+id.toUpperCase()+'…');$('#editStatus').scrollIntoView({block:'center'});const p=pass();lock();const g=generation;task(async()=>{if((await store.list()).includes(id)){const d=await store.load(p,id);if(g===generation){render(d,true);message('Đã mở bản nháp.');}return;}const d=beginEdit(snapshot,id);if(g===generation){render(d,false);message('Chỉ sửa hạn đăng kiểm và ghi chú thử nghiệm, chưa gửi Windows.');}})})}
export function configureDraftSend(fn){sendDraft=fn;}
export function configureConflictRead(fn){readLatest=fn;}
function showHistory(id){const p=pass();lock();const g=generation;task(async()=>{const h=await store.history(p,id);if(g===generation)message(h.length?h.map(d=>`Revision ${d.baseRevision}: hạn gốc ${d.baseDue||'chưa có'}, hạn nháp ${d.editedDue||'chưa có'}`).join(' | '):'Chưa có lịch sử đối chiếu.');});}
function reconcile(id,choice){if(busy||!readLatest)return;const p=pass();lock();const g=generation;
 task(async()=>{const d=await store.load(p,id);if(await store.confirmed(p,id))throw Error('Bản nháp đã có xác nhận. Không đổi căn cứ.');if(await store.pending(p,id))throw Error('Cần gửi lại cùng thao tác để kiểm tra biên nhận trước khi đối chiếu.');
  const fresh=await readLatest();if(g!==generation)return;
  const {kind,latest}=inspectConflict(d,fresh);
  if(kind==='same'){message('Căn cứ vẫn đúng; không cần đổi. Có thể gửi lại bản nháp cũ.');return;}
  if(['epoch','rollback','inconsistent'].includes(kind))throw Error('Phiên máy chủ hoặc revision không nhất quán. Giữ nguyên bản nháp; cần kiểm tra Windows.');
  if(kind==='already-current'&&choice==='draft')throw Error('Windows đã có cùng hạn. Đây không phải biên nhận. Chọn Dùng hạn Windows hoặc giữ bản nháp.');
  const detail=`${id.toUpperCase()}\nHạn gốc: ${d.baseDue||'chưa có'} (rev ${d.baseRevision})\nHạn nháp: ${d.editedDue||'chưa có'}\nHạn Windows: ${latest.baseDue||'chưa có'} (rev ${latest.baseRevision})\n${choice==='draft'?'Giữ hạn nháp, đổi căn cứ sang Windows mới.':'Dùng hạn Windows, không gửi thay đổi hạn.'}\nChỉ lưu cục bộ, giữ bản nháp cũ mã hóa. Nếu lần gửi trước chưa có biên nhận, không suy đoán kết quả. Tiếp tục?`;
  if(!confirm(detail)||g!==generation){message('Đã hủy, bản nháp không đổi.');return;}
  await store.rebase(p,d,fresh,choice);results.delete(id);if(g===generation)message('Đã lưu căn cứ mới và lịch sử mã hóa. Chưa gửi Windows.');
 });
}
const statusText=r=>({synced:'Đã đồng bộ',confirmed:'Đã có xác nhận Windows',unchanged:'Không đổi hạn',changed:'Bản nháp đã thay đổi; cần xác nhận lại',conflict:'Cần đối chiếu Windows',error:r.message||'Chưa xác nhận'})[r.state];
function record(r){results.set(r.id,statusText(r));message(r.id.toUpperCase()+': '+statusText(r));}
async function refreshAfter(g){if(canSend(g)){try{await readLatest();return "";}catch{return " Chưa tải lại được hồ sơ Windows; kết quả gửi đã xác nhận vẫn được giữ.";}}return "";}
function canSend(g){return g===generation&&deviceVault.ready()&&!document.hidden&&navigator.onLine!==false;}
function send(id){if(busy||!sendDraft||!readLatest||!confirm('Gửi hạn đăng kiểm đã lưu của '+id.toUpperCase()+' về Windows DEMO? Ghi chú vẫn ở iPhone.'))return;const p=pass();lock();const g=generation;task(async()=>{const r=await syncOne({store,password:p,id,readLatest,send:sendDraft,allowed:()=>canSend(g)});record(r);if(r.state==='synced'){const extra=await refreshAfter(g);message(r.id.toUpperCase()+': '+statusText(r)+extra);}});}
$('#syncAll').addEventListener('click',()=>{
 if(busy||!native||!sendDraft||!readLatest||!confirm('Gửi lần lượt tất cả bản nháp DEMO đã lưu ? Nếu hạn trên Windows đã đổi, giữ bản nháp để đối chiếu.'))return;
 const p=pass();lock();const g=generation;task(async()=>{const ids=await store.list();const rows=await syncBatch({ids,store,password:p,readLatest,send:sendDraft,allowed:()=>canSend(g),onResult:record});
 const n=state=>rows.filter(r=>r.state===state).length;
 const extra=rows.length===ids.length&&!n('error')&&n('synced')?await refreshAfter(g):'';
 message(`Đồng bộ: ${n('synced')} mới, ${n('confirmed')} đã xác nhận, ${n('conflict')} cần đối chiếu, ${n('unchanged')} không đổi, ${n('error')} lỗi, ${ids.length-rows.length} chưa xử lý. Bản nháp vẫn giữ.`+extra);
 });
});
function armAuto(id){
 if(busy||!sendDraft||!readLatest||!deviceVault.ready())return;
 const p=pass();lock();const g=generation;
 task(async()=>{
  const approved=await prepareAutoBatch({ids:id?[id]:await store.list(),store,password:p});
  if(!approved.size){message('Không có bản nháp thay đổi chưa xác nhận.');return;}
  if(g!==generation||document.hidden)return;
  if(!confirm('Cho phép tự gửi '+[...approved.keys()].map(x=>x.toUpperCase()).join(', ')+' trong 2 phút khi có mạng và ứng dụng đang mở? Bản nháp thay đổi sau xác nhận sẽ không được gửi.'))return;
  if(g!==generation||document.hidden)return;
  const expires=Date.now()+120000;
  const allowed=()=>{if(!auto.pending||g!==generation||!deviceVault.ready()||document.hidden||Date.now()>=expires)return false;if(navigator.onLine===false)throw Object.assign(Error('Mất kết nối; giữ nguyên hàng đợi.'),{code:'NETWORK'});return autoReady();};
  const job=createApprovedBatch({approved,store,password:p,readLatest,send:sendDraft,allowed,onResult:record});
  auto.arm(async()=>{const summary=await job.run();const extra=await refreshAfter(g);message(summary+extra);return summary+extra;});
 });
}
$('#autoAll').addEventListener('click',()=>armAuto());
$('#autoCancel').addEventListener('click',()=>cancelAutoSync());
window.addEventListener('online',()=>void auto.tick());
setInterval(()=>void auto.tick(),3000);
export function refreshVaultUI(){return refresh();}
export function initEditUI(isNative){native=isNative;if(!native){message('Chỉ sử dụng trên iPhone native.');return;}refresh().catch(()=>message('Không mở được kho bản nháp.'));}
$('#editForm').addEventListener('submit',e=>{e.preventDefault();if(busy||!current)return;const d=current,wasExisting=existing,p=pass(),g=generation;task(async()=>{const updated=reviseEdit(d,$('#editDue').value,$('#editNote').value);await store.save(p,d,updated,{existing:wasExisting});results.delete(d.id);if(g===generation){lock();message('Đã mã hóa và lưu bản nháp. Chưa gửi Windows.');}})});
$('#editCancel').addEventListener('click',()=>{lock();message('Đã đóng trình sửa. Bản nháp đã lưu không bị xóa.');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){auto.cancel();snapshot=null;lock();message('Đã khóa bản nháp.');}});
