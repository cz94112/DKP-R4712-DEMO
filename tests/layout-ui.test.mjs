import test from 'node:test';
import assert from 'node:assert/strict';
import {validatedInsets,applyInsets} from '../www/layout-ui.js';
const sample={top:59,right:0,bottom:34,left:0};
test('valid UIKit measurements preserve all four edges',()=>assert.deepEqual(validatedInsets(sample),sample));
test('zero insets are valid when webview is already safe',()=>assert.deepEqual(validatedInsets({top:0,right:0,bottom:0,left:0}),{top:0,right:0,bottom:0,left:0}));
test('invalid, incomplete or negative measurements fail closed',()=>{for(const top of [-1,201,NaN,Infinity,'59',null])assert.equal(validatedInsets({...sample,top}),null);assert.equal(validatedInsets({top:59}),null);});
test('native insets write only layout properties',()=>{const values=new Map();const root={style:{setProperty:(k,v)=>values.set(k,v)}};assert.equal(applyInsets(root,sample),true);assert.equal(values.get('--native-top'),'59px');assert.equal(values.get('--native-bottom'),'34px');assert.equal(applyInsets(root,{top:-1}),false);assert.equal(values.size,4);});
test('rotation replaces previous measurements rather than accumulating',()=>{const values=new Map();const root={style:{setProperty:(k,v)=>values.set(k,v)}};applyInsets(root,sample);applyInsets(root,{top:0,right:59,bottom:21,left:59});assert.equal(values.get('--native-top'),'0px');assert.equal(values.get('--native-left'),'59px');});
