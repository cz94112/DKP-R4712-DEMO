import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDemoPage} from '../www/native-api.js';
import {sealSnapshot} from '../www/snapshot-cache.js';
import {beginEdit,reviseEdit,sealEdit} from '../www/offline-edits.js';
import {encryptDraft} from '../www/vault-crypto.js';
import {decodeEntry,migrateLegacy,verifyVault} from '../www/legacy-migration.js';
const p='old snapshot password',q='other old draft password',secret=Buffer.alloc(32,42).toString('base64');
const snapshot=validateDemoPage(JSON.parse(readFileSync(new URL('./fixture-r33-page.json',import.meta.url))));
const d=reviseEdit(beginEdit(snapshot,'demo-001'),'2028-01-01','pending local note');
const d2=reviseEdit(beginEdit(snapshot,'demo-002'),'2028-02-02','confirmed local note');
const entries=[
 ['r471:server-snapshot',await sealSnapshot(p,snapshot,12345)],
 ['r472:edit:demo-001',{...await sealEdit(q,d),history:[await sealEdit(p,beginEdit(snapshot,'demo-001'))],pending:await sealEdit(q,d,'pending')}],
 ['r472:edit:demo-002',{...await sealEdit(q,d2),confirmation:await sealEdit(q,d2,'confirmation')}],
 ['r472:edit:demo-003',await sealEdit(q,beginEdit(snapshot,'demo-003'))],
 ['DEMO-001',await encryptDraft(p,{vehicleId:'DEMO-001',inspectionDue:'2027-01-01',notes:'illustrative only'})]
];
function mock(source=entries){let data=structuredClone(source),writes=0,creates=0;return {read:async()=>structuredClone(data),replace:async(before,next,allowed)=>{assert.deepEqual(before,data);if(!allowed())throw Error('locked');data=structuredClone(next);writes++;},createSecret:async()=>{creates++;return secret},writes:()=>writes,creates:()=>creates};}
test('all three drafts, snapshot, pending, confirmation, history, illustrative and mixed passwords',async()=>{const m=mock();const result=await migrateLegacy({...m,passwords:[p,q]});assert.equal(result.count,5);assert.equal(m.writes(),1);assert.equal(m.creates(),1);const after=await m.read();for(let i=0;i<entries.length;i++)assert.deepEqual(await decodeEntry(...after[i],[secret]),await decodeEntry(...entries[i],[p,q]));assert.ok(!JSON.stringify(after).includes('pending local note'));await verifyVault(secret,m.read);});
test('incomplete passwords never write or create key',async()=>{const m=mock();await assert.rejects(migrateLegacy({...m,passwords:[p]}));assert.deepEqual(await m.read(),entries);assert.equal(m.creates(),0);assert.equal(m.writes(),0);});
test('unknown key blocks migration',async()=>{const m=mock([...entries,['unknown',{}]]);await assert.rejects(migrateLegacy({...m,passwords:[p,q]}),/chưa hỗ trợ/);assert.equal(m.writes(),0);assert.equal(m.creates(),0);});
test('mismatched pending marker blocks migration',async()=>{const broken=structuredClone(entries);broken[1][1].pending=await sealEdit(q,reviseEdit(d,'2029-01-01','other'),'pending');const m=mock(broken);await assert.rejects(migrateLegacy({...m,passwords:[p,q]}),/không khớp/);assert.deepEqual(await m.read(),broken);});
test('failed atomic write and retry using existing key',async()=>{const m=mock();await assert.rejects(migrateLegacy({...m,passwords:[p,q],replace:async()=>{throw Error('disk error')}}));assert.deepEqual(await m.read(),entries);await migrateLegacy({...m,passwords:[p,q],existingSecret:secret});assert.equal(m.creates(),1);assert.equal(m.writes(),1);});
test('authorization revoked before write',async()=>{const m=mock();let allowed=true;await assert.rejects(migrateLegacy({...m,passwords:[p,q],allowed:()=>allowed,createSecret:async()=>{allowed=false;return secret}}),/khóa/);assert.equal(m.writes(),0);});
