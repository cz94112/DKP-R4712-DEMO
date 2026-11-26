// Local only: verify all ciphertext, preserve revisions, history, pending and confirmation.
import {openSnapshot,sealSnapshot} from './snapshot-cache.js';
import {openEdit,sealEdit} from './offline-edits.js';
import {decryptDraft,encryptDraft} from './vault-crypto.js';
import {readVaultEntries,replaceVaultEntries} from './vault-storage.js';
const snap='r471:server-snapshot';
const baseFields=['schema','kind','salt','iv','data'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const shape=(r,fields)=>{if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!fields.includes(k)))throw Error('Định dạng cũ chưa hỗ trợ. Giữ nguyên kho.');};
export async function decodeEntry(k,r,candidates){
 async function read(fn){for(const p of candidates){try{return await fn(p)}catch{}}throw Error('Không mở được '+k+'; kiểm tra mật khẩu cũ hoặc dữ liệu hỏng.');}
 if(k===snap){shape(r,baseFields);return {kind:'snapshot',value:await read(p=>openSnapshot(p,r))};}
 if(/^DEMO-00[123]$/.test(k)){shape(r,['schema','algorithm','kdf','iterations','salt','nonce','data']);const value=await read(p=>decryptDraft(p,r));if(value.vehicleId!==k)throw Error('Mã xe cũ không khớp.');return {kind:'illustrative',value};}
 if(!/^r472:edit:demo-00[123]$/.test(k))throw Error('Có mục cũ chưa hỗ trợ; giữ nguyên toàn bộ kho.');
 shape(r,[...baseFields,'history','pending','confirmation']);const id=k.slice('r472:edit:'.length);
 const open=(record,purpose='draft')=>read(p=>openEdit(p,id,record,purpose));
 const value=await open(r),history=[];
 if('history' in r){if(!Array.isArray(r.history)||r.history.length>20)throw Error('Lịch sử cũ không hợp lệ.');for(const h of r.history){shape(h,baseFields);history.push(await open(h));}}
 if('pending' in r&&'confirmation' in r)throw Error('Trạng thái đồng bộ cũ không nhất quán.');
 const result={kind:'edit',value};if('history' in r)result.history=history;
 for(const purpose of ['pending','confirmation'])if(purpose in r){shape(r[purpose],baseFields);const d=await open(r[purpose],purpose);if(!same(d,value))throw Error('Biên nhận hoặc thao tác chờ không khớp.');result[purpose]=d;}
 return result;
}
async function encodeEntry(p,d){
 if(d.kind==='snapshot')return sealSnapshot(p,d.value.snapshot,d.value.savedAt);
 if(d.kind==='illustrative')return encryptDraft(p,d.value);
 const result=await sealEdit(p,d.value);
 if('history' in d)result.history=await Promise.all(d.history.map(h=>sealEdit(p,h)));
 for(const purpose of ['pending','confirmation'])if(purpose in d)result[purpose]=await sealEdit(p,d[purpose],purpose);
 return result;
}
export async function verifyVault(secret,read=readVaultEntries){for(const [k,r] of await read())await decodeEntry(k,r,[secret]);}
export async function migrateLegacy({passwords,existingSecret='',createSecret,allowed=()=>true,read=readVaultEntries,replace=replaceVaultEntries}){
 if(!allowed())throw Error('Cần phiên đăng nhập hợp lệ.');
 const candidates=[...new Set([existingSecret,...passwords].filter(p=>typeof p==='string'&&p.length>=12&&p.length<=256))];
 const before=await read();if(!before.length)throw Error('Không có dữ liệu cũ cần chuyển đổi.');
 const decoded=[];for(const [k,r] of before){if(!allowed())throw Error('Phiên đã khóa.');decoded.push([k,await decodeEntry(k,r,candidates)]);}
 if(!allowed())throw Error('Phiên đã khóa.');
 const secret=existingSecret||await createSecret();
 if(typeof secret!=='string'||! /^[A-Za-z0-9+/]{43}=$/.test(secret)||atob(secret).length!==32)throw Error('Khóa mới không hợp lệ.');
 const next=[];for(const [k,d] of decoded){if(!allowed())throw Error('Phiên đã khóa.');const encrypted=await encodeEntry(secret,d);if(!same(d,await decodeEntry(k,encrypted,[secret])))throw Error('Kiểm tra dữ liệu mới không khớp.');next.push([k,encrypted]);}
 if(!allowed())throw Error('Phiên đã khóa.');await replace(before,next,allowed);
 return {count:next.length,secret};
}
