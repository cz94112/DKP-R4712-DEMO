// R4.7.11-A: sequential DEMO sync. The server's strict revision check remains authoritative.
import {inspectConflict} from './offline-edits.js';
export async function syncOne({store,password,id,readLatest,send,allowed=()=>true,approve=()=>true}){
 const gate=()=>{if(!allowed())throw Object.assign(Error('Đã dừng gửi; bản nháp vẫn được giữ.'),{code:'STOPPED'});};
 gate();let d=await store.load(password,id);
 gate();if(!approve(d))return {id,state:'changed'};
 if(await store.confirmed(password,id))return {id,state:'confirmed'};
 if(d.baseDue===d.editedDue)return {id,state:'unchanged'};
 const pending=await store.pending(password,id);
 if(!pending){
  gate();const fresh=await readLatest();gate();
  const {kind}=inspectConflict(d,fresh);
  // A revision change in another record is not itself a date conflict.
  // Never rebase an uncertain operation; retry the exact original payload instead.
  if(kind==='revision-only')d=await store.rebase(password,d,fresh,'draft');
  else if(kind!=='same')return {id,state:'conflict',kind};
 }
 gate();await store.markPending(password,d);gate();
 try{await send(d)}catch(e){
  if(e.code==='CONFLICT'){await store.releaseRejected(password,d);return {id,state:'conflict',kind:'server-rejected'};}
  throw e; // Leave pending intact on uncertainty, including lost response.
 }
 await store.confirm(password,d);return {id,state:'synced'};
}
export async function syncBatch({ids,store,password,readLatest,send,allowed=()=>true,onResult=()=>{}}){
 const results=[];
 for(const id of [...new Set(ids)]){
  if(!allowed())break;
  let result;
  try{result=await syncOne({store,password,id,readLatest,send,allowed})}
  catch(e){result={id,state:'error',code:e.code||'LOCAL_ERROR',message:e.message||'Không xử lý được bản nháp.'};}
  results.push(result);onResult(result);
  if(result.state==='error'&&['NETWORK','UNAUTHORIZED','FORBIDDEN','RATE_LIMIT','STOPPED','BAD_REDIRECT','WRONG_DATASET','BAD_SHAPE','HTTP_ERROR'].includes(result.code))break;
 }
 return results;
}
