import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDemoPage} from '../www/native-api.js';
import {beginEdit,reviseEdit,createEditStore} from '../www/offline-edits.js';
import {prepareAutoBatch,createApprovedBatch} from '../www/auto-batch.js';
import {createAutoSync} from '../www/auto-sync.js';
import {draftPayload} from '../www/native-sync.js';
const base=validateDemoPage(JSON.parse(readFileSync(new URL('./fixture-r33-page.json',import.meta.url))));
const ids=base.items.map(v=>v.id), password='test-only-password';
async function fixture(){
 const m=new Map(),store=createEditStore({read:async k=>m.get(k),write:async(k,v)=>m.set(k,v),remove:async k=>m.delete(k),keys:async()=>[...m.keys()]});
 for(let i=0;i<ids.length;i++){const b=beginEdit(base,ids[i]);await store.save(password,b,reviseEdit(b,`2028-01-0${i+1}`,'local'));}
 let snapshot=structuredClone(base),sent=[];
 const advance=(id,due)=>{snapshot={...snapshot,revision:snapshot.revision+1,items:snapshot.items.map(v=>v.id===id?{...v,inspectionDue:due}:v)};};
 const readLatest=async()=>snapshot;
 const send=async d=>{sent.push(await draftPayload(d));assert.equal(d.baseRevision,snapshot.revision);assert.equal(d.baseDue,snapshot.items.find(v=>v.id===d.id).inspectionDue);advance(d.id,d.editedDue);};
 return {ids,store,password,readLatest,send,advance,sent};
}

async function job(f,options={}){const approved=await prepareAutoBatch(f);return createApprovedBatch({...f,approved,allowed:()=>true,...options});}
test('automatic batch updates three same revision drafts',async()=>{const f=await fixture();const j=await job(f);assert.match(await j.run(),/3 đã xác nhận/);assert.equal(f.sent.length,3);await j.run();assert.equal(f.sent.length,3);});
test('date conflict isolated from two other cars',async()=>{const f=await fixture();const j=await job(f);f.advance(ids[1],'2030-01-01');assert.match(await j.run(),/2 đã xác nhận, 1 cần đối chiếu/);assert.equal(f.sent.length,2);assert.equal(await f.store.confirmed(password,ids[1]),false);});
test('lost reply on second car, retry exact pending payload and continue',async()=>{const f=await fixture();let lost;const j=await job(f,{send:async d=>{if(d.id===ids[1]){if(lost){assert.deepEqual(await draftPayload(d),lost);return;}lost=await draftPayload(d);await f.send(d);throw Object.assign(Error('lost'),{code:'NETWORK'});}await f.send(d);}});await assert.rejects(j.run(),e=>e.code==='NETWORK');assert.match(j.summary(),/1 đã xác nhận.*2 chưa xử lý/);assert.equal(await f.store.pending(password,ids[1]),true);assert.match(await j.run(),/3 đã xác nhận/);assert.equal(f.sent.length,3);});
test('changed draft after approval is not sent',async()=>{const f=await fixture();const j=await job(f);const d=await f.store.load(password,ids[0]);await f.store.save(password,d,reviseEdit(d,'2029-01-01',d.note),{existing:true});assert.match(await j.run(),/2 đã xác nhận.*1 đã sửa lại/);assert.equal(f.sent.length,2);});
test('cancel after first receipt retains remaining drafts',async()=>{const f=await fixture();let allowed=true;const j=await job(f,{allowed:()=>allowed,onResult:()=>{allowed=false}});await assert.rejects(j.run(),e=>e.code==='STOPPED');assert.equal(f.sent.length,1);assert.match(j.summary(),/1 đã xác nhận.*2 chưa xử lý/);});
test('expired session stops queue without dropping drafts',async()=>{const f=await fixture();const j=await job(f,{send:async()=>{throw Object.assign(Error('expired'),{code:'UNAUTHORIZED'});}});await assert.rejects(j.run(),e=>e.code==='UNAUTHORIZED');assert.match(j.summary(),/3 chưa xử lý/);assert.deepEqual(await f.store.list(),ids);});
test('approval excludes confirmed and unchanged drafts',async()=>{const f=await fixture();const d=await f.store.load(password,ids[0]);await f.store.confirm(password,d);const e=await f.store.load(password,ids[1]);await f.store.save(password,e,reviseEdit(e,e.baseDue,e.note),{existing:true});const approved=await prepareAutoBatch(f);assert.deepEqual([...approved.keys()],[ids[2]]);});
test('scheduler waits offline then returns actual batch summary',async()=>{const f=await fixture();let online=false;const messages=[];const j=await job(f);const q=createAutoSync({ready:()=>online,send:async fn=>fn(),onStatus:s=>messages.push(s)});q.arm(j.run);await q.tick();assert.equal(f.sent.length,0);online=true;await q.tick();assert.equal(f.sent.length,3);assert.match(messages.at(-1),/3 đã xác nhận/);});
