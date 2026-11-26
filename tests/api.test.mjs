import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoClient,ensureNativePlugin,validateDemoPage} from '../www/native-api.js';
import {DEMO_URL} from '../www/validations.js';
const goodPage=()=>({total:3,filtered:3,page:1,pages:1,revision:8,server_epoch:'demo-epoch-1',items:[
  {id:'demo-001',plate:'DEMO-001',name:'KIA minh hoạ',inspectionDue:'2026-11-28'},
  {id:'demo-002',plate:'DEMO-002',name:'Toyota minh hoạ',inspectionDue:'2026-12-27'},
  {id:'demo-003',plate:'DEMO-003',name:'Ford minh hoạ',inspectionDue:''}
]});
function api(request){const calls=[];const http={request:async x=>{calls.push(x);const d=await request(x);return {url:x.url,status:200,data:d};}};return {client:new DemoClient(http),calls};}
function mock(login=true,withCookie=true){return api(x=>{
  if(x.url.endsWith('/api/login'))return {ok:login};
  if(x.url.includes('/api/vehicles/page'))return goodPage();
  if(x.url.endsWith('/api/state/revision'))return {revision:8,server_epoch:'demo-epoch-1'};
  if(x.url.endsWith('/api/logout'))return {ok:true};
  return {};
});}
test('native only fail-closed',()=>{
  assert.throws(()=>ensureNativePlugin({isNativePlatform:()=>false,Plugins:{CapacitorHttp:{request(){}}}}),{code:'NATIVE_REQUIRED'});
  assert.throws(()=>ensureNativePlugin({isNativePlatform:()=>true,Plugins:{}}),{code:'NATIVE_REQUIRED'});
});
test('native plugin accepted only when native',()=>{const h={request(){}};assert.equal(ensureNativePlugin({isNativePlatform:()=>true,Plugins:{CapacitorHttp:h}}),h)});
test('login checks real authenticated read before success',async()=>{
  const {client,calls}=mock();const snap=await client.login('quanly','temporary-credential');
  assert.equal(client.authenticated,true);assert.equal(snap.items.length,3);
  assert.equal(calls.length,2);assert.equal(calls[0].url,DEMO_URL+'/api/login');
  assert.equal(calls[0].method,'POST');assert.equal(calls[1].method,'GET');
  assert.equal(calls[0].headers['x-dkp-write'],'1');assert.equal(calls[0].disableRedirects,true);
  assert.equal(calls[0].data.platform,'web');assert.ok(!JSON.stringify(calls).includes('http://'));
});
test('server login response alone not proof of cookie; 401 blocks',async()=>{
 const c=new DemoClient({request:async x=> x.url.endsWith('/api/login') ? {url:x.url,status:200,data:{ok:true}} : {url:x.url,status:401,data:{detail:'auth'}}});
 await assert.rejects(()=>c.login('demo','demo-password'),{code:'UNAUTHORIZED'});assert.equal(c.authenticated,false);
});
test('reject redirects even 200',async()=>{const c=new DemoClient({request:async x=>({url:'https://unapproved.example/',status:200,data:{ok:true}})});await assert.rejects(()=>c.login('demo','pw'),{code:'BAD_REDIRECT'});});
test('reject invalid dataset greater than 3 cars',()=>assert.throws(()=>validateDemoPage({...goodPage(),total:23}),{code:'WRONG_DATASET'}));
test('reject fake but different ids',()=>assert.throws(()=>validateDemoPage({...goodPage(),items:[...goodPage().items.slice(0,2),{id:'REAL-001'}]}),{code:'WRONG_DATASET'}));
test('reject duplicate ids',()=>assert.throws(()=>validateDemoPage({...goodPage(),items:[goodPage().items[0],goodPage().items[0],goodPage().items[1]]}),{code:'WRONG_DATASET'}));
test('validate demo page whitelist fields',()=>{const p=goodPage();p.items[0].password='test';const normalized=validateDemoPage(p);assert.equal(Object.hasOwn(normalized.items[0],'password'),false);});
test('preflight unchanged revision',async()=>{const {client}=mock();await client.login('user','pass');assert.equal((await client.preflight()).same,true);});
test('preflight changed revision',async()=>{const {client}=api(x=>{
  if(x.url.endsWith('/api/login'))return {ok:true};
  if(x.url.includes('vehicles/page'))return goodPage();
  if(x.url.includes('state/revision'))return {revision:9,server_epoch:'demo-epoch-1'};
});await client.login('user','pass');assert.equal((await client.preflight()).same,false);});
test('route is restricted and update endpoints impossible',async()=>{const {client,calls}=mock();await assert.rejects(()=>client.send('state-write'),{code:'BAD_ROUTE'});assert.equal(calls.length,0);});
test('reject arbitrary HTTP methods',async()=>{const {client}=mock();await assert.rejects(()=>client.send('page','PUT'),{code:'BAD_METHOD'});});
test('force sign out before clearing local flag',async()=>{const {client,calls}=mock();await client.login('user','pass');await client.logout();assert.equal(client.authenticated,false);assert.equal(calls.at(-1).url,DEMO_URL+'/api/logout');});
test('server rejected invalid credentials',async()=>{const {client}=mock(false);await assert.rejects(()=>client.login('user','bad'),{code:'BAD_LOGIN'});});
test('HTTP 429 has explicit safe error',async()=>{const c=new DemoClient({request:async x=>({url:x.url,status:429,data:{}})});await assert.rejects(()=>c.login('user','pass'),{code:'RATE_LIMIT'});});
test('no network call for empty credentials',async()=>{const {client,calls}=mock();await assert.rejects(()=>client.login('',''),{code:'BAD_INPUT'});assert.equal(calls.length,0);});

test('R3.3 contract exact id/plate pairs, stable internal id',()=>{const snap=validateDemoPage(goodPage());assert.equal(snap.items[0].id,'demo-001');assert.equal(snap.items[0].plate,'DEMO-001')});
test('reject previous uppercase id mistake',()=>{const p=goodPage();p.items[0].id='DEMO-001';assert.throws(()=>validateDemoPage(p),{code:'WRONG_DATASET'})});
test('reject swapped plates',()=>{const p=goodPage();[p.items[0].plate,p.items[1].plate]=[p.items[1].plate,p.items[0].plate];assert.throws(()=>validateDemoPage(p),{code:'WRONG_DATASET'})});
test('reject mismatched or missing plate',()=>{const p=goodPage();delete p.items[0].plate;assert.throws(()=>validateDemoPage(p),{code:'WRONG_DATASET'})});
test('reject non-string fields',()=>{const p=goodPage();p.items[0].inspectionDue=null;assert.throws(()=>validateDemoPage(p),{code:'BAD_SHAPE'})});
test('reject null item and malformed id',()=>{for(const v of [null,[],{id:['demo-001'],plate:'DEMO-001'}]){const p=goodPage();p.items[0]=v;assert.throws(()=>validateDemoPage(p),{code:'WRONG_DATASET'})}});
test('accept reordered exact pairs',()=>{const p=goodPage();p.items.reverse();assert.equal(validateDemoPage(p).items.length,3)});
test('read routes cannot post and auth routes cannot get',async()=>{const {client,calls}=mock();await assert.rejects(()=>client.send('page','POST'),{code:'BAD_METHOD'});await assert.rejects(()=>client.send('login','GET'),{code:'BAD_METHOD'});assert.equal(calls.length,0)});
test('accept actual R3.3 storage page from isolated seeded SQLite',async()=>{
 const {readFile}=await import('node:fs/promises');
 const page=JSON.parse(await readFile(new URL('./fixture-r33-page.json',import.meta.url),'utf8'));
 const {client}=api(x=>x.url.endsWith('/api/login')?{ok:true}:page);
 const snapshot=await client.login('demo','test-only');
 assert.deepEqual(snapshot.items.map(v=>[v.id,v.plate]),[['demo-001','DEMO-001'],['demo-002','DEMO-002'],['demo-003','DEMO-003']]);
});
