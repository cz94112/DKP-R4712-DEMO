import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDemoPage,DemoClient} from '../www/native-api.js';
import {beginEdit,reviseEdit,createEditStore} from '../www/offline-edits.js';
import {draftPayload,submitDraft} from '../www/native-sync.js';
const s=validateDemoPage(JSON.parse(readFileSync(new URL('./fixture-r33-page.json',import.meta.url))));
const base=beginEdit(s,'demo-001'),draft=reviseEdit(base,'2027-03-01','local only'),pw='test-password-123';
const ack=b=>({ok:true,operation_id:b.operation_id,vehicle_id:b.vehicle_id,revision:b.base_revision+1,inspectionDue:b.new_due,duplicate_ack:false});
function memory(){const m=new Map();return {m,read:async k=>m.get(k),write:async(k,v)=>m.set(k,v),remove:async k=>m.delete(k),keys:async()=>[...m.keys()]};}
test('same retry ID; local note not sent',async()=>{const b=await draftPayload(draft);assert.equal(b.operation_id,(await draftPayload(draft)).operation_id);assert.equal(b.operation_id.length,64);assert.ok(!JSON.stringify(b).includes('local only'));assert.notEqual(b.operation_id,(await draftPayload(reviseEdit(draft,'2027-03-02',''))).operation_id)});
test('reject unchanged date',async()=>assert.rejects(draftPayload(base)));
test('requires login',async()=>assert.rejects(submitDraft({authenticated:false},draft)));
test('native method is post only, rejects unauthenticated',async()=>{const c=new DemoClient({request:async()=>{throw Error('unexpected')}});await assert.rejects(c.send('draft','GET'),{code:'BAD_METHOD'});await assert.rejects(c.send('draft','POST',{}),{code:'UNAUTHORIZED'})});
test('checks response fields and accepts repeat receipt',async()=>{const client={authenticated:true,send:async(r,m,b)=>{assert.equal(r,'draft');assert.equal(m,'POST');return {...ack(b),duplicate_ack:true}}};assert.equal((await submitDraft(client,draft)).duplicate_ack,true);for(const field of ['operation_id','vehicle_id','revision','inspectionDue','ok','duplicate_ack'])await assert.rejects(submitDraft({...client,send:async(r,m,b)=>({...ack(b),[field]:null})},draft));});
test('HTTP 409 explicit, network error preserves retry payload',async()=>{let captured;const c=new DemoClient({request:async x=>{captured=x.data;return {url:x.url,status:409,data:{}}}});c.authenticated=true;await assert.rejects(submitDraft(c,draft),{code:'CONFLICT'});assert.deepEqual(captured,await draftPayload(draft));c.http.request=async()=>{throw Error()};await assert.rejects(submitDraft(c,draft),{code:'NETWORK'});});
test('receipt marker encrypted; draft stays after confirmed; change clears marker',async()=>{const m=memory(),store=createEditStore(m);await store.save(pw,base,draft);assert.equal(await store.confirmed(pw,draft.id),false);await store.confirm(pw,draft);assert.equal(await createEditStore(m).confirmed(pw,draft.id),true);assert.deepEqual(await store.load(pw,draft.id),draft);assert.ok(!JSON.stringify([...m.m.values()]).includes('local only'));await store.save(pw,draft,reviseEdit(draft,'2027-03-02',''),{existing:true});assert.equal(await store.confirmed(pw,draft.id),false);});
test('copy draft ciphertext as confirmation rejected',async()=>{const m=memory(),store=createEditStore(m);await store.save(pw,base,draft);const [k,v]=[...m.m.entries()][0];m.m.set(k,{...v,confirmation:v});await assert.rejects(store.confirmed(pw,draft.id));});
test('failed confirmation write leaves original intact',async()=>{const m=memory(),store=createEditStore(m);await store.save(pw,base,draft);m.write=async()=>{throw Error('disk')};await assert.rejects(store.confirm(pw,draft));assert.deepEqual(await store.load(pw,draft.id),draft);assert.equal(await store.confirmed(pw,draft.id),false);});
