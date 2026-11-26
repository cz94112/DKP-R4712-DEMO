import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDemoPage} from '../www/native-api.js';
import {beginEdit,reviseEdit,createEditStore} from '../www/offline-edits.js';
import {syncBatch,syncOne} from '../www/batch-sync.js';
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
test('three drafts from one revision sync sequentially, no duplicate',async()=>{const f=await fixture();const rows=await syncBatch(f);assert.deepEqual(rows.map(r=>r.state),['synced','synced','synced']);assert.deepEqual(f.sent.map(x=>x.base_revision),[base.revision,base.revision+1,base.revision+2]);assert.deepEqual((await syncBatch(f)).map(r=>r.state),['confirmed','confirmed','confirmed']);assert.equal(f.sent.length,3);});
test('a real date conflict does not block other cars',async()=>{const f=await fixture();f.advance(ids[1],'2030-01-01');const rows=await syncBatch(f);assert.deepEqual(rows.map(r=>r.state),['synced','conflict','synced']);assert.equal((await f.readLatest()).items[1].inspectionDue,'2030-01-01');assert.equal((await f.store.load(password,ids[1])).editedDue,'2028-01-02');});
test('same desired date is not a receipt',async()=>{const f=await fixture();f.advance(ids[0],'2028-01-01');const r=await syncOne({...f,id:ids[0]});assert.equal(r.kind,'already-current');assert.equal(await f.store.confirmed(password,ids[0]),false);assert.equal(f.sent.length,0);});
test('new epoch does not write',async()=>{const f=await fixture();const r=await syncOne({...f,id:ids[0],readLatest:async()=>({...base,serverEpoch:'new-epoch'})});assert.equal(r.kind,'epoch');assert.equal(f.sent.length,0);});
test('lost response stops batch; retry uses exact pending payload',async()=>{const f=await fixture();let first;const lost=await syncBatch({...f,send:async d=>{first=await draftPayload(d);await f.send(d);throw Object.assign(Error('lost'),{code:'NETWORK'});}});assert.equal(lost.length,1);assert.equal(await f.store.pending(password,ids[0]),true);const next=await syncBatch({...f,send:async d=>{if(d.id===ids[0]){assert.deepEqual(await draftPayload(d),first);return;}await f.send(d);}});assert.deepEqual(next.map(r=>r.state),['synced','synced','synced']);});
test('server rejects a race, preserves draft and continues',async()=>{const f=await fixture();const r=await syncBatch({...f,send:async d=>{if(d.id===ids[0]){f.advance(d.id,'2030-01-01');throw Object.assign(Error('race'),{code:'CONFLICT'});}await f.send(d);}});assert.deepEqual(r.map(x=>x.state),['conflict','synced','synced']);assert.equal(await f.store.pending(password,ids[0]),false);assert.equal((await f.store.load(password,ids[0])).editedDue,'2028-01-01');});
test('foreground stop after first receipt prevents next send',async()=>{const f=await fixture();let allowed=true;const rows=await syncBatch({...f,allowed:()=>allowed,onResult:()=>{allowed=false;}});assert.equal(rows.length,1);assert.equal(f.sent.length,1);assert.equal(await f.store.confirmed(password,ids[0]),true);});
test('wrong password does not send or mutate data',async()=>{const f=await fixture();const rows=await syncBatch({...f,password:'wrong-password-123'});assert.equal(rows.length,3);assert.ok(rows.every(r=>r.state==='error'));assert.equal(f.sent.length,0);});
