// R4.7.1: explicit, encrypted read-only DEMO cache. No network calls.
import {validateDemoPage} from './native-api.js';
import {saveEncrypted,readEncrypted,deleteEncrypted} from './vault-storage.js';
const KEY='r471:server-snapshot';
const AAD=new TextEncoder().encode('DKP/R471/server-snapshot/v1');
const ITER=310000;
const enc=new TextEncoder(), dec=new TextDecoder();
const b64=b=>btoa(String.fromCharCode(...b));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function checkPass(p){if(typeof p!=='string'||p.length<12||p.length>256)throw Error('Mật khẩu kho hồ sơ phải từ 12 đến 256 ký tự.');}
function normalized(s){
 if(!s||!Array.isArray(s.items))throw Error('Hồ sơ chưa hợp lệ.');
 return validateDemoPage({total:3,filtered:3,page:1,pages:1,revision:s.revision,server_epoch:s.serverEpoch,items:s.items});
}
async function key(p,salt){checkPass(p);const raw=await crypto.subtle.importKey('raw',enc.encode(p),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITER,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function sealSnapshot(p,s,now=Date.now()){
 checkPass(p);const snapshot=normalized(s);
 if(!Number.isSafeInteger(now)||now<0||now>8640000000000000)throw Error('Thời điểm lưu không hợp lệ.');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD},await key(p,salt),enc.encode(JSON.stringify({snapshot,savedAt:now})));
 return {schema:1,kind:'server-snapshot',salt:b64(salt),iv:b64(iv),data:b64(new Uint8Array(ciphertext))};
}
export async function openSnapshot(p,r){
 checkPass(p);
 try{
 if(r?.schema!==1||r.kind!=='server-snapshot'||typeof r.data!=='string'||r.data.length>24000||typeof r.salt!=='string'||r.salt.length!==24||typeof r.iv!=='string'||r.iv.length!==16)throw Error();
 const salt=bytes(r.salt),iv=bytes(r.iv),data=bytes(r.data);
 if(salt.length!==16||iv.length!==12||data.length<16)throw Error();
 const payload=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:AAD},await key(p,salt),data)));
 if(!Number.isSafeInteger(payload.savedAt)||payload.savedAt<0||payload.savedAt>8640000000000000)throw Error();
 return {snapshot:normalized(payload.snapshot),savedAt:payload.savedAt};
 }catch{throw Error('Không mở được kho hồ sơ: sai mật khẩu hoặc dữ liệu hỏng.');}
}
const defaultStore={read:()=>readEncrypted(KEY),write:r=>saveEncrypted(KEY,r),remove:()=>deleteEncrypted(KEY)};
export function createSnapshotCache(store=defaultStore){
 let busy=false;
 async function exclusive(fn){if(busy)throw Error('Kho hồ sơ đang xử lý.');busy=true;try{return await fn()}finally{busy=false}}
 return {
  exists:async()=>Boolean(await store.read()),
  save:(p,s)=>exclusive(async()=>{const old=await store.read();if(old)await openSnapshot(p,old);const record=await sealSnapshot(p,s);await store.write(record);}),
  open:p=>exclusive(async()=>{const r=await store.read();if(!r)throw Error('Chưa có hồ sơ đã lưu.');return openSnapshot(p,r)}),
  remove:()=>exclusive(()=>store.remove())
 };
}
