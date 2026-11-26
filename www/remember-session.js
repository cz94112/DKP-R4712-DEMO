// No password or token in JS storage. The native HTTP cookie remains authoritative.
export const LOCAL_TTL_MS=8*60*60*1000;
const valid=(v,now)=>Number.isSafeInteger(v)&&v>now&&v-now<=LOCAL_TTL_MS;
export function createRememberedSession({plugin,now=Date.now}={}){
 const bridge=()=>plugin??globalThis.Capacitor?.Plugins?.DKPVault;
 return {
  async remember(){const result=await bridge().rememberLogin();if(!valid(result?.expiresAt,now()))throw Error('Không xác nhận được thời hạn ghi nhớ.');return result.expiresAt;},
  async expiry(){const result=await bridge().readLogin();return valid(result?.expiresAt,now())?result.expiresAt:0;},
  async forget(){const result=await bridge().forgetLogin();if(result?.ok!==true)throw Error('Không xóa được phiên ghi nhớ.');},
  async restore(api,{online=true}={}){
   const expiresAt=await this.expiry();
   if(!expiresAt)return {kind:'login'};
   if(!online)return {kind:'offline',expiresAt};
   try{const snapshot=await api.resume();return {kind:'online',snapshot,expiresAt};}
   catch(error){if(error.code==='NETWORK')return {kind:'offline',expiresAt};await this.forget();throw error;}
  }
 };
}
export const rememberedSession=createRememberedSession();
