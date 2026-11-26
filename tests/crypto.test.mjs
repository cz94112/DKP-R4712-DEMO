import test from 'node:test';import assert from 'node:assert/strict';
// Node.js 22 supplies standards-compatible global WebCrypto, atob and btoa.
import {encryptDraft,decryptDraft} from '../www/vault-crypto.js';
import {trustedEndpoint,DEMO_URL,validDueDate} from '../www/validations.js';
const draft={vehicleId:'DEMO-001',inspectionDue:'2026-11-28',notes:'ghi chú giả lập'};
test('AES-256-GCM round trip',async()=>assert.deepEqual(await decryptDraft('password-for-demo-123',await encryptDraft('password-for-demo-123',draft)),draft));
test('wrong passphrase fails',async()=>{const encrypted=await encryptDraft('good-password--12345',draft);await assert.rejects(()=>decryptDraft('bad-password--12345',encrypted));});
test('ciphertext tamper fails',async()=>{const r=await encryptDraft('password-for-demo-123',draft);r.data=r.data.substring(0,r.data.length-4)+'AAAA';await assert.rejects(()=>decryptDraft('password-for-demo-123',r));});
test('randomized output',async()=>{const a=await encryptDraft('password-for-demo-123',draft),b=await encryptDraft('password-for-demo-123',draft);assert.notEqual(a.data,b.data);assert.notEqual(a.nonce,b.nonce);});
test('block unknown vehicles',async()=>await assert.rejects(()=>encryptDraft('password-for-demo-123',{...draft,vehicleId:'REAL-123'})));
test('reject unexpected field',async()=>await assert.rejects(()=>encryptDraft('password-for-demo-123',{...draft,secret:'x'})));
test('reject invalid date',()=>assert.equal(validDueDate('2026-02-30'),false));
test('allow only configured HTTPS endpoint',()=>{assert.equal(trustedEndpoint(DEMO_URL),DEMO_URL);assert.equal(trustedEndpoint('http://'+DEMO_URL.substring(8)),null);assert.equal(trustedEndpoint('https://evil.example/'),null);});
test('block URL credentials',()=>assert.equal(trustedEndpoint('https://u:pw@recede-putdown-hardy.ngrok-free.dev'),null));
