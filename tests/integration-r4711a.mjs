// Integration-only harness, never part of www or the iOS runtime.
import assert from 'node:assert/strict';
import {DemoClient} from '../www/native-api.js';
import {beginEdit,reviseEdit,createEditStore} from '../www/offline-edits.js';
import {submitDraft} from '../www/native-sync.js';
import {syncBatch} from '../www/batch-sync.js';
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
const client=new DemoClient(bridge), snapshot=await client.login('quanly','test-only-password');
const m=new Map(), adapter={read:async k=>m.get(k),write:async(k,v)=>m.set(k,v),remove:async k=>m.delete(k),keys:async()=>[...m.keys()]};
const password='integration-only-password', ids=snapshot.items.map(v=>v.id), store=createEditStore(adapter);
for(let i=0;i<ids.length;i++){const b=beginEdit(snapshot,ids[i]);await store.save(password,b,reviseEdit(b,`2028-03-0${i+1}`,'local note'));}
const cfg={ids,store,password,readLatest:()=>client.refresh(),send:d=>submitDraft(client,d)};
drop=true;const first=await syncBatch(cfg);assert.equal(first.length,1);assert.equal(first[0].code,'NETWORK');assert.equal(await store.pending(password,ids[0]),true);
const second=await syncBatch(cfg);assert.deepEqual(second.map(r=>r.state),['synced','synced','synced']);
assert.deepEqual((await syncBatch(cfg)).map(r=>r.state),['confirmed','confirmed','confirmed']);
const latest=await client.refresh();assert.equal(latest.revision,snapshot.revision+3);assert.deepEqual(latest.items.map(v=>v.inspectionDue),['2028-03-01','2028-03-02','2028-03-03']);
await client.logout();console.log('PASS actual FastAPI + SQLite: three cars, lost first reply, exact retry, three receipts, no duplicate');
