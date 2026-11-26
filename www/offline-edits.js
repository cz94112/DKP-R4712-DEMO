// R4.7.2: encrypted local drafts derived from validated Windows DEMO snapshots.
// No network calls. Original snapshots and R4.4 illustrative drafts remain untouched.
import {validateDemoPage} from './native-api.js';
import {validDueDate} from './validations.js';
import {saveEncrypted,readEncrypted,deleteEncrypted,listKeys} from './vault-storage.js';
const ids=['demo-001','demo-002','demo-003'];
const prefix='r472:edit:';
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=b=>btoa(String.fromCharCode(...b));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const aad=(id,purpose='draft')=>enc.encode((purpose==='pending'?'DKP/R476/pending/v1/':purpose==='confirmation'?'DKP/R473/confirmation/v1/':'DKP/R472/offline-edit/v1/')+id);
const keys='baseDue,baseRevision,baseServerEpoch,editedDue,id,note';
function idCheck(id){if(!ids.includes(id))throw Error('Chỉ hỗ trợ 3 xe DEMO.');return id;}
function passCheck(p){if(typeof p!=='string'||p.length<12||p.length>256)throw Error('Mật khẩu bản nháp phải từ 12 đến 256 ký tự.');}
function validate(d){
 if(!d||Object.keys(d).sort().join(',')!==keys)throw Error('Bản nháp không đúng định dạng.');
 idCheck(d.id);
 if(!Number.isSafeInteger(d.baseRevision)||d.baseRevision<0||typeof d.baseServerEpoch!=='string'||d.baseServerEpoch.length<4||d.baseServerEpoch.length>200)throw Error('Thiếu phiên bản gốc.');
 if(typeof d.baseDue!=='string'||typeof d.editedDue!=='string'||!validDueDate(d.baseDue)||!validDueDate(d.editedDue))throw Error('Ngày đăng kiểm không hợp lệ.');
 if(typeof d.note!=='string'||d.note.length>1000)throw Error('Ghi chú không hợp lệ (tối đa 1000 ký tự).');
 return {id:d.id,baseRevision:d.baseRevision,baseServerEpoch:d.baseServerEpoch,baseDue:d.baseDue,editedDue:d.editedDue,note:d.note};
}
export function beginEdit(snapshot,id){
 idCheck(id);const s=validateDemoPage({total:3,filtered:3,page:1,pages:1,revision:snapshot?.revision,server_epoch:snapshot?.serverEpoch,items:snapshot?.items});
 const v=s.items.find(v=>v.id===id);
 return validate({id,baseRevision:s.revision,baseServerEpoch:s.serverEpoch,baseDue:v.inspectionDue,editedDue:v.inspectionDue,note:''});
}
export function reviseEdit(d,editedDue,note){return validate({...validate(d),editedDue,note});}
export function compareBase(d,snapshot){const b=beginEdit(snapshot,d.id);validate(d);return b.baseRevision===d.baseRevision&&b.baseServerEpoch===d.baseServerEpoch&&b.baseDue===d.baseDue;}
// Explicit conflict resolution from a freshly downloaded, validated server snapshot.
export function inspectConflict(d,snapshot){
 d=validate(d);const latest=beginEdit(snapshot,d.id);
 let kind='same';
 if(latest.baseServerEpoch!==d.baseServerEpoch)kind='epoch';
 else if(latest.baseRevision<d.baseRevision)kind='rollback';
 else if(latest.baseRevision===d.baseRevision&&latest.baseDue!==d.baseDue)kind='inconsistent';
 else if(latest.baseRevision!==d.baseRevision){
  kind=latest.baseDue===d.editedDue?'already-current':latest.baseDue===d.baseDue?'revision-only':'date-conflict';
 }
 return Object.freeze({kind,latest});
}
export function resolveConflict(d,snapshot,choice){
 d=validate(d);const {kind,latest}=inspectConflict(d,snapshot);
 if(!['revision-only','date-conflict','already-current'].includes(kind))throw Error('Không thể đổi căn cứ: phiên máy chủ, revision hoặc dữ liệu không phù hợp. Giữ bản nháp.');
 if(!['draft','windows'].includes(choice))throw Error('Cần chọn rõ cách xử lý.');
 if(kind==='already-current'&&choice==='draft')throw Error('Windows đã có cùng hạn; không được coi là biên nhận đồng bộ. Có thể dùng hạn Windows để lưu căn cứ mới.');
 return reviseEdit(latest,choice==='draft'?d.editedDue:latest.baseDue,d.note);
}
async function derive(p,salt){passCheck(p);const raw=await crypto.subtle.importKey('raw',enc.encode(p),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function sealEdit(p,d,purpose='draft'){
 d=validate(d);const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(d.id,purpose)},await derive(p,salt),enc.encode(JSON.stringify(d)));
 return {schema:1,kind:'offline-edit',salt:b64(salt),iv:b64(iv),data:b64(new Uint8Array(data))};
}
export async function openEdit(p,id,r,purpose='draft'){
 idCheck(id);passCheck(p);
 try{if(r?.schema!==1||r.kind!=='offline-edit'||typeof r.data!=='string'||r.data.length>24000||typeof r.salt!=='string'||r.salt.length!==24||typeof r.iv!=='string'||r.iv.length!==16)throw Error();
 const salt=bytes(r.salt),iv=bytes(r.iv);if(salt.length!==16||iv.length!==12)throw Error();
 const d=validate(JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(id,purpose)},await derive(p,salt),bytes(r.data)))));
 if(d.id!==id)throw Error();return d;
 }catch{throw Error('Không mở được bản nháp: sai mật khẩu hoặc dữ liệu hỏng.');}
}
const storage={read:readEncrypted,write:saveEncrypted,remove:deleteEncrypted,keys:listKeys};
export function createEditStore(store=storage){
 let busy=false;
 async function exclusive(fn){if(busy)throw Error('Kho bản nháp đang xử lý.');busy=true;try{return await fn()}finally{busy=false}}
 const key=id=>prefix+idCheck(id);
 return {
  list:async()=>{const keys=await store.keys();return ids.filter(id=>keys.includes(key(id)))},
  load:(p,id)=>exclusive(async()=>{const r=await store.read(key(id));if(!r)throw Error('Chưa có bản nháp.');return openEdit(p,id,r)}),
  save:(p,original,updated,{existing=false}={})=>exclusive(async()=>{
   original=validate(original);updated=validate(updated);
   if(JSON.stringify(reviseEdit(original,updated.editedDue,updated.note))!==JSON.stringify(updated))throw Error('Không được thay đổi căn cứ gốc.');
   const k=key(original.id),old=await store.read(k);
   if(old){if(old.pending)throw Error('Cần kiểm tra lại kết quả gửi trước khi sửa.');if(!existing)throw Error('Đã có bản nháp. Mở lại trước khi lưu.');const previous=await openEdit(p,original.id,old);if(JSON.stringify(previous)!==JSON.stringify(original))throw Error('Bản nháp đã thay đổi. Mở lại trước khi lưu.');}
   else if(existing||original.editedDue!==original.baseDue||original.note!=='')throw Error('Bản nháp gốc không còn.');
   await store.write(k,{...await sealEdit(p,updated),...(old?.history?{history:old.history}:{})});
  }),
  rebase:(p,original,snapshot,choice)=>exclusive(async()=>{
   original=validate(original);const k=key(original.id),old=await store.read(k);
   if(!old||JSON.stringify(await openEdit(p,original.id,old))!==JSON.stringify(original))throw Error('Bản nháp đã thay đổi. Mở lại trước khi đối chiếu.');
   if(old.pending)throw Error('Cần kiểm tra lại kết quả gửi trước khi đổi căn cứ.');
   if(old.confirmation)throw Error('Bản nháp đã có xác nhận. Không đổi căn cứ của thao tác đã xác nhận.');
   const next=resolveConflict(original,snapshot,choice), history=old.history??[];
   if(!Array.isArray(history)||history.length>=20)throw Error('Đã đạt giới hạn lịch sử đối chiếu. Giữ nguyên bản nháp.');
   const archived={schema:old.schema,kind:old.kind,salt:old.salt,iv:old.iv,data:old.data};
   await store.write(k,{...await sealEdit(p,next),history:[...history,archived]});
   return next;
  }),
  history:(p,id)=>exclusive(async()=>{
   const old=await store.read(key(id));if(!old)throw Error('Chưa có bản nháp.');
   await openEdit(p,id,old);const history=old.history??[];
   if(!Array.isArray(history)||history.length>20)throw Error('Lịch sử không hợp lệ.');
   return Promise.all(history.map(item=>openEdit(p,id,item)));
  }),
  markPending:(p,d)=>exclusive(async()=>{
   d=validate(d);if(d.baseDue===d.editedDue)throw Error('Không có thay đổi hạn để gửi.');const k=key(d.id),old=await store.read(k);
   if(!old||JSON.stringify(await openEdit(p,d.id,old))!==JSON.stringify(d)||old.confirmation)throw Error('Bản nháp đã thay đổi hoặc đã xác nhận.');
   if(old.pending){if(JSON.stringify(await openEdit(p,d.id,old.pending,'pending'))!==JSON.stringify(d))throw Error('Dấu chờ không khớp.');return;}
   await store.write(k,{...old,pending:await sealEdit(p,d,'pending')});
  }),
  pending:(p,id)=>exclusive(async()=>{const old=await store.read(key(id));if(!old)return false;const d=await openEdit(p,id,old);if(!old.pending)return false;if(JSON.stringify(d)!==JSON.stringify(await openEdit(p,id,old.pending,'pending')))throw Error('Dấu chờ không khớp.');return true;}),
  releaseRejected:(p,d)=>exclusive(async()=>{
   d=validate(d);const k=key(d.id),old=await store.read(k);
   if(!old?.pending||JSON.stringify(await openEdit(p,d.id,old))!==JSON.stringify(d)||JSON.stringify(await openEdit(p,d.id,old.pending,'pending'))!==JSON.stringify(d))throw Error('Không khớp bản nháp đang chờ.');
   const {pending,...rest}=old;await store.write(k,rest);
  }),
  confirm:(p,d)=>exclusive(async()=>{
   d=validate(d);const k=key(d.id),old=await store.read(k);
   if(!old||JSON.stringify(await openEdit(p,d.id,old))!==JSON.stringify(d))throw Error('Bản nháp đã thay đổi; chưa lưu xác nhận.');
   if(old.pending&&JSON.stringify(await openEdit(p,d.id,old.pending,'pending'))!==JSON.stringify(d))throw Error('Dấu chờ không khớp.');
   const {pending,...rest}=old;await store.write(k,{...rest,confirmation:await sealEdit(p,d,'confirmation')});
  }),
  confirmed:(p,id)=>exclusive(async()=>{const old=await store.read(key(id));if(!old)return false;const d=await openEdit(p,id,old);return !!old.confirmation&&JSON.stringify(d)===JSON.stringify(await openEdit(p,id,old.confirmation,'confirmation'));}),
  remove:(p,id)=>exclusive(async()=>{const k=key(id),old=await store.read(k);if(!old)throw Error('Không còn bản nháp.');await openEdit(p,id,old);if(old.pending)throw Error('Cần kiểm tra lại kết quả gửi trước khi xóa.');await store.remove(k)})
 };
}
