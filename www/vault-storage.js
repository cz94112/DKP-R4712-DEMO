// IndexedDB stores only encrypted blobs + non-sensitive demo ID. No plaintext vehicle notes, keys or passwords.
const DATABASE='dkp-capacitor-r44-demo-v1';
const STORE='drafts';
function openDb(){ return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DATABASE,1);
  req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE); };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(Error('Không mở được kho ngoại tuyến.'));
}); }
async function transact(mode, cb){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);
    let result, settled=false;
    const finish=(error)=>{ if(settled)return; settled=true; db.close(); if(error)reject(error); else resolve(result); };
    tx.oncomplete=()=>finish(); // Only acknowledge writes after actual IndexedDB commit.
    tx.onabort=()=>finish(Error('Lỗi giao dịch bản nháp (đã hủy).'));
    tx.onerror=()=>finish(Error('Lỗi giao dịch bản nháp.'));
    const request=cb(tx.objectStore(STORE));
    request.onsuccess=()=>{result=request.result};
    request.onerror=()=>finish(Error('Không truy cập được bản nháp ngoại tuyến.'));
  });
}
export const saveEncrypted=(id,encrypted)=>transact('readwrite',store=>store.put(encrypted,id));
export const readEncrypted=(id)=>transact('readonly',store=>store.get(id));
export const deleteEncrypted=(id)=>transact('readwrite',store=>store.delete(id));
export const listKeys=()=>transact('readonly',store=>store.getAllKeys());

// Read all encrypted records from one consistent IndexedDB transaction.
export async function readVaultEntries(){
 const db=await openDb();return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly'),store=tx.objectStore(STORE),keys=store.getAllKeys(),values=store.getAll();
  tx.oncomplete=()=>{db.close();resolve(keys.result.map((k,i)=>[k,values.result[i]]));};
  tx.onabort=tx.onerror=()=>{db.close();reject(Error('Không đọc được kho để chuyển đổi.'));};
 });
}
// Compare the entire encrypted inventory and commit all replacements or none.
export async function replaceVaultEntries(expected,next,allowed=()=>true){
 const db=await openDb();return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),keys=store.getAllKeys(),values=store.getAll();
  let failure='Không lưu được giao dịch chuyển đổi.';
  const check=()=>{if(keys.readyState!=='done'||values.readyState!=='done')return;
   try{const actual=keys.result.map((k,i)=>[k,values.result[i]]);
    if(!allowed()||JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Kho hoặc phiên đã thay đổi. Giữ nguyên dữ liệu.');
    if(JSON.stringify(next.map(x=>x[0]))!==JSON.stringify(expected.map(x=>x[0])))throw Error('Danh sách khóa thay đổi.');
    for(const [k,v] of next)store.put(v,k);
   }catch(e){failure=e.message;tx.abort();}
  };
  keys.onsuccess=values.onsuccess=check;
  tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(Error(failure));};
 });
}
