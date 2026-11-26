// Demonstration only. AES-GCM with a user-entered passphrase; NEVER stores the key or passphrase.
// Server is never called from this file. This is a NEW Capacitor sandbox, not a Safari PWA vault migration.
import {validDueDate, validVehicleId} from './validations.js';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 310000;
const B64=(bytes)=>{
  let out=''; for(const byte of bytes) out+=String.fromCharCode(byte);
  return btoa(out);
};
const UNB64=(text)=>Uint8Array.from(atob(text), c=>c.charCodeAt(0));
function ensurePassphrase(passphrase){
  if(typeof passphrase!=='string' || passphrase.length<12 || passphrase.length>256) throw Error('Mật khẩu khóa bản nháp phải từ 12 đến 256 ký tự.');
}
function ensureDraft(draft){
  if(!draft || !validVehicleId(draft.vehicleId)) throw Error('Chỉ hỗ trợ 3 xe giả lập DEMO.');
  if(!validDueDate(draft.inspectionDue)) throw Error('Ngày đăng kiểm chưa hợp lệ.');
  if(typeof draft.notes !== 'string' || draft.notes.length>1000) throw Error('Ghi chú quá dài hoặc không hợp lệ.');
  // Hard block additional properties to prevent accidental disclosure of real vehicle data.
  if(Object.keys(draft).sort().join(',')!=='inspectionDue,notes,vehicleId') throw Error('Không hỗ trợ trường dữ liệu khác.');
}
async function deriveKey(passphrase, salt) {
  const raw=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptDraft(passphrase,draft) {
  ensurePassphrase(passphrase); ensureDraft(draft);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(passphrase,salt);
  const data=encoder.encode(JSON.stringify({schema:1,...draft}));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,data);
  return {schema:1,algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:B64(salt),nonce:B64(nonce),data:B64(new Uint8Array(ciphertext))};
}
export async function decryptDraft(passphrase,record){
  ensurePassphrase(passphrase);
  if(!record||record.schema!==1||record.algorithm!=='AES-256-GCM'||record.kdf!=='PBKDF2-SHA256'||record.iterations!==ITERATIONS) throw Error('Không hỗ trợ định dạng bản nháp này.');
  const salt=UNB64(record.salt), nonce=UNB64(record.nonce), data=UNB64(record.data);
  if(salt.length!==16||nonce.length!==12||data.length<16||data.length>32768) throw Error('Tệp mã hóa không hợp lệ.');
  const key=await deriveKey(passphrase,salt);
  // Wrong passphrase OR corrupted ciphertext intentionally yields the same generic error.
  let decoded;
  try { decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},key,data); }
  catch { throw Error('Không mở được bản nháp: sai mật khẩu hoặc dữ liệu không hợp lệ.'); }
  let draft;
  try { draft=JSON.parse(decoder.decode(decoded)); }
  catch { throw Error('Định dạng bản nháp bị hỏng.'); }
  if(draft.schema!==1) throw Error('Không hỗ trợ phiên bản bản nháp.');
  const {vehicleId,inspectionDue,notes}=draft;
  ensureDraft({vehicleId,inspectionDue,notes});
  return {vehicleId,inspectionDue,notes};
}
