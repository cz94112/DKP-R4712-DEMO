// Integration-only harness, never part of www or the iOS runtime.
import assert from 'node:assert/strict';
import {DemoClient} from '../www/native-api.js';
import {beginEdit,reviseEdit,createEditStore} from '../www/offline-edits.js';
import {submitDraft} from '../www/native-sync.js';
import {DEMO_URL} from '../www/validations.js';
const local=new URL(process.argv[2]);
assert.equal(local.hostname,'127.0.0.1');assert.equal(local.protocol,'http:');
let cookie='',drop=false;
const bridge={async request(o){
 const target=new URL(o.url);assert.equal(target.origin,DEMO_URL);
 const dest=new URL(target.pathname+target.search,local);assert.equal(dest.origin,local.origin);
 const headers={...o.headers};if(cookie)headers.Cookie=cookie;
 const r=await fetch(dest,{method:o.method,headers,body:o.method==='POST'?JSON.stringify(o.data):undefined,redirect:'manual'});
 const cookies=r.headers.getSetCookie();if(cookies.length)cookie=cookies[0].split(';')[0];
 const data=await r.json();
 if(drop&&target.pathname==='/api/test-r473/native-draft'){drop=false;assert.equal(r.status,200);throw Error('Simulated lost response after commit');}
 return {status:r.status,url:o.url,data};
}};
const client=new DemoClient(bridge), s=await client.login('quanly','test-only-password');
const m=new Map(), adapter={read:async k=>m.get(k),write:async(k,v)=>m.set(k,v),remove:async k=>m.delete(k),keys:async()=>[...m.keys()]};
const pw='integration-only-password', b=beginEdit(s,'demo-001'),d=reviseEdit(b,'2028-02-02','local integration note');
let store=createEditStore(adapter);await store.save(pw,b,d);await store.markPending(pw,d);drop=true;
await assert.rejects(submitDraft(client,d),e=>e.code==='NETWORK');
store=createEditStore(adapter);assert.equal(await store.pending(pw,d.id),true);
const replay=await submitDraft(client,await store.load(pw,d.id));assert.equal(replay.duplicate_ack,true);await store.confirm(pw,d);assert.equal(await store.confirmed(pw,d.id),true);
const stale=reviseEdit(beginEdit(s,'demo-002'),'2028-03-03','');await assert.rejects(submitDraft(client,stale),e=>e.code==='CONFLICT');
const latest=await client.refresh();assert.equal(latest.revision,s.revision+1);assert.equal(latest.items.find(v=>v.id===d.id).inspectionDue,d.editedDue);
await client.logout();await assert.rejects(submitDraft(client,d));
console.log('PASS actual local API: login, write, lost response, receipt replay, conflict, refresh, logout');
