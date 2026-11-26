// Explicit foreground approval of a fixed set of saved DEMO drafts.
import {syncOne} from './batch-sync.js';
const sameIntent=(a,b)=>a.id===b.id&&a.baseServerEpoch===b.baseServerEpoch&&a.baseDue===b.baseDue&&a.editedDue===b.editedDue&&a.note===b.note&&b.baseRevision>=a.baseRevision;
const terminalCodes=new Set(['UNAUTHORIZED','FORBIDDEN','RATE_LIMIT','STOPPED','BAD_REDIRECT','WRONG_DATASET','BAD_SHAPE','HTTP_ERROR']);
export async function prepareAutoBatch({ids,store,password}){
 const approved=new Map();
 for(const id of new Set(ids)){
  const d=await store.load(password,id);
  if(d.baseDue!==d.editedDue&&!(await store.confirmed(password,id)))approved.set(id,Object.freeze({...d}));
 }
 return approved;
}
export function createApprovedBatch({approved,store,password,readLatest,send,allowed,onResult=()=>{}}){
 const remaining=new Map(approved),results=new Map();
 const summary=()=>{const n=s=>[...results.values()].filter(r=>r.state===s).length;return `Tự đồng bộ: ${n('synced')+n('confirmed')} đã xác nhận, ${n('conflict')} cần đối chiếu, ${n('changed')} đã sửa lại, ${n('error')} lỗi, ${remaining.size} chưa xử lý. Bản nháp vẫn giữ.`;};
 async function run(){
  for(const [id,original] of remaining){
   if(!allowed())throw Object.assign(Error(summary()),{code:'STOPPED'});
   let r;
   try{r=await syncOne({id,store,password,readLatest,send,allowed,approve:d=>sameIntent(original,d)});}
   catch(e){
    r={id,state:'error',code:e.code||'LOCAL_ERROR',message:e.message||'Chưa xác nhận'};
    onResult(r);
    if(r.code==='NETWORK'||terminalCodes.has(r.code))throw Object.assign(Error(summary()+' '+r.message),{code:r.code});
   }
   remaining.delete(id);results.set(id,r);if(r.state!=='error')onResult(r);
  }
  return summary();
 }
 return {run,summary};
}
