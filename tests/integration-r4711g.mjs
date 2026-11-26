// Integration harness only. Loopback transport, simulated native cookie/Keychain and storage.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {DemoClient} from '../www/native-api.js';
import {beginEdit,reviseEdit,createEditStore} from '../www/offline-edits.js';
import {submitDraft,draftPayload} from '../www/native-sync.js';
import {prepareAutoBatch,createApprovedBatch} from '../www/auto-batch.js';
import {createAutoSync} from '../www/auto-sync.js';
import {createDeviceVault} from '../www/device-vault.js';
import {createRememberedSession,LOCAL_TTL_MS} from '../www/remember-session.js';
import {DEMO_URL} from '../www/validations.js';
const local=new URL(process.argv[2]);assert.equal(local.hostname,'127.0.0.1');assert.equal(local.protocol,'http:');
const scenario=process.argv[3];let cookie='',drop=false,online=true,expiry=0,secret='',clock=Date.now(),posts=[];
const bridge={async request(o){
 if(!online)throw Error('offline');
 const target=new URL(o.url);assert.equal(target.origin,DEMO_URL);
 const dest=new URL(target.pathname+target.search,local);assert.equal(dest.origin,local.origin);
 const headers={...o.headers};if(cookie)headers.Cookie=cookie;
 const r=await fetch(dest,{method:o.method,headers,body:o.method==='POST'?JSON.stringify(o.data):undefined,redirect:'manual'});
 const cookies=r.headers.getSetCookie();if(cookies.length)cookie=cookies[0].split(';')[0];
 const data=await r.json();
 if(target.pathname==='/api/test-r473/native-draft'){posts.push(structuredClone(o.data));if(drop&&o.data.vehicle_id==='demo-002'){drop=false;assert.equal(r.status,200);throw Error('lost after commit');}}
 return {status:r.status,url:o.url,data};
}};
const plugin={readSecret:async()=>secret?{found:true,secret}:{found:false},createSecret:async()=>({found:true,secret:secret||=randomBytes(32).toString('base64')}),rememberLogin:async()=>({expiresAt:expiry=clock+LOCAL_TTL_MS}),readLogin:async()=>({expiresAt:expiry}),forgetLogin:async()=>{expiry=0;return {ok:true}}};
let client=new DemoClient(bridge),session=createRememberedSession({plugin,now:()=>clock});
const snapshot=await client.login('quanly','test-only-password');await session.remember();
const m=new Map(),adapter={read:async k=>m.get(k),write:async(k,v)=>m.set(k,v),remove:async k=>m.delete(k),keys:async()=>[...m.keys()]};
const ids=snapshot.items.map(v=>v.id);let store=createEditStore(adapter),vault=createDeviceVault({plugin,keys:adapter.keys});await vault.unlock();const key=vault.secret();
for(let i=0;i<ids.length;i++){const b=beginEdit(snapshot,ids[i]);await store.save(key,b,reviseEdit(b,`2028-04-0${i+1}`,'local only'));}
// Simulated app relaunch, same secure store, offline access only.
vault.lock();online=false;client=new DemoClient(bridge);session=createRememberedSession({plugin,now:()=>clock});assert.equal((await session.restore(client,{online:false})).kind,'offline');assert.equal(client.authenticated,false);
vault=createDeviceVault({plugin,keys:adapter.keys});await vault.unlock();assert.equal(vault.secret(),key);store=createEditStore(adapter);assert.deepEqual(await store.list(),ids);assert.equal((await store.load(key,ids[2])).editedDue,'2028-04-03');
online=true;assert.equal((await session.restore(client)).kind,'online');
const cfg={ids,store,password:key,readLatest:()=>client.refresh(),send:d=>submitDraft(client,d)};
const approved=await prepareAutoBatch(cfg);
if(scenario==='conflict'){
 const b=beginEdit(await client.refresh(),ids[1]);await submitDraft(client,reviseEdit(b,'2030-01-01',''));
}
if(scenario==='lost')drop=true;
const job=createApprovedBatch({...cfg,approved,allowed:()=>true});const messages=[];
const queue=createAutoSync({now:()=>clock,ready:()=>online,send:fn=>fn(),onStatus:s=>messages.push(s)});
queue.arm(job.run);online=false;const pre=posts.length;await queue.tick();assert.equal(posts.length,pre);online=true;await queue.tick();
if(scenario==='lost'){assert.equal(queue.pending,true);assert.equal(await store.pending(key,ids[1]),true);clock+=15000;await queue.tick();assert.deepEqual(posts[1],posts[2]);}
assert.equal(queue.pending,false);const latest=await client.refresh();assert.equal(latest.revision,snapshot.revision+3);
assert.deepEqual(latest.items.map(v=>v.inspectionDue),scenario==='conflict'?['2028-04-01','2030-01-01','2028-04-03']:['2028-04-01','2028-04-02','2028-04-03']);
for(const id of ids)assert.equal(await store.confirmed(key,id),scenario!=='conflict'||id!==ids[1]);
assert.equal(posts.length,scenario==='lost'?4:3);assert.match(messages.at(-1),scenario==='conflict'?/2 đã xác nhận, 1 cần đối chiếu/:/3 đã xác nhận/);
await client.logout();await session.forget();vault.lock();assert.equal((await session.restore(client,{online:false})).kind,'login');assert.equal(vault.ready(),false);
console.log('PASS '+scenario+' / actual FastAPI+SQLite, simulated native storage and session');
