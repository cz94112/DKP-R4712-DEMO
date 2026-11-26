// Only activate after the authenticated, validated DEMO login succeeds.
// No user password, storage fallback, or automatic destruction of legacy blobs.
import {verifyVault,migrateLegacy} from './legacy-migration.js';
import {listKeys} from './vault-storage.js';
const valid = s => typeof s==='string' && /^[A-Za-z0-9+/]{43}=$/.test(s) && atob(s).length===32;
export function createDeviceVault({plugin,keys=listKeys,verify=async()=>{},migrate=migrateLegacy}={}){
 let secret=null, generation=0, busy=false, needsMigration=false;
 const bridgeFor=()=>plugin??globalThis.Capacitor?.Plugins?.DKPVault;
 return {
  ready:()=>secret!==null,
  needsMigration:()=>needsMigration,
  secret:()=>secret||'',
  lock:()=>{generation++;secret=null;needsMigration=false;},
  unlock:async()=>{
   if(busy)throw Error('Kho đang mở.');
   busy=true;needsMigration=false;const g=generation;
   try{
    const bridge=bridgeFor();
    if(typeof bridge?.readSecret!=='function'||typeof bridge?.createSecret!=='function')throw Error('Thiếu Keychain native; không mở kho.');
    let result=await bridge.readSecret();
    if(g!==generation)throw Error('Đã khóa kho.');
    if(result?.found===false){
     if((await keys()).length){needsMigration=true;throw Error('Có dữ liệu mã hóa cũ hoặc mất khóa. Giữ nguyên dữ liệu; cần chuyển đổi một lần.');}
     if(g!==generation)throw Error('Đã khóa kho.');
     result=await bridge.createSecret();
    }
    if(result?.found!==true||!valid(result.secret))throw Error('Khóa Keychain không hợp lệ; giữ nguyên dữ liệu.');
    if(g!==generation)throw Error('Đã khóa kho.');
    try{await verify(result.secret);}catch{if(g===generation)needsMigration=true;throw Error('Kho có dữ liệu cũ hoặc không đọc được. Giữ nguyên dữ liệu.');}
    if(g!==generation)throw Error('Đã khóa kho.');
    secret=result.secret;
   }finally{busy=false;}
  },
  migrate:async(passwords,authorized)=>{
   if(busy||!needsMigration||!authorized())throw Error('Cần đăng nhập Windows để chuyển đổi.');
   busy=true;const g=generation,allowed=()=>g===generation&&authorized();
   try{const bridge=bridgeFor();const old=await bridge.readSecret();
    if(old?.found!==false&&(old?.found!==true||!valid(old.secret)))throw Error('Khóa Keychain không hợp lệ.');
    const result=await migrate({passwords,existingSecret:old.found?old.secret:'',allowed,createSecret:async()=>{const r=await bridge.createSecret();if(r?.found!==true||!valid(r.secret))throw Error('Không tạo được khóa Keychain.');return r.secret;}});
    if(!allowed())throw Error('Đã khóa kho; mở lại sau khi đăng nhập.');
    secret=result.secret;needsMigration=false;return result.count;
   }finally{busy=false;}
  }
 };
}
export const deviceVault=createDeviceVault({plugin:globalThis.Capacitor?.Plugins?.DKPVault,verify:verifyVault});
