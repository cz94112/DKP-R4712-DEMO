from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class AutoSyncSource(unittest.TestCase):
 def test_hooks(self):
  s=(ROOT/'www/offline-edit-ui.js').read_text(); self.assertIn("window.addEventListener('online'",s);self.assertIn('if(document.hidden){auto.cancel()',s);self.assertIn('!auto.pending||g!==generation||!deviceVault.ready()||document.hidden||Date.now()>=expires',s);self.assertIn('await store.confirm(password,d)',(ROOT/'www/batch-sync.js').read_text())
 def test_native_gate_and_logout(self):
  s=(ROOT/'www/remote-ui.js').read_text();self.assertIn('configureAutoReady(()=>nativeReady&&!busy&&!cacheBusy&&!!client?.authenticated&&(!rememberedUntil||Date.now()<rememberedUntil))',s);self.assertIn("$('#nativeLogout').addEventListener('click',()=>{cancelAutoSync()",s)
 def test_no_disk_or_network_in_scheduler(self):
  s=(ROOT/'www/auto-sync.js').read_text()
  for word in ['localStorage','sessionStorage','indexedDB','fetch(','CapacitorHttp']:self.assertNotIn(word,s)
 def test_packaging(self):
  self.assertIn('cmp "$APP/public/auto-sync.js" www/auto-sync.js',(ROOT/'codemagic.yaml').read_text())
  h=(ROOT/'www/index.html').read_text();self.assertEqual(h.count('id="autoCancel"'),1);self.assertEqual(h.count('id="autoStatus"'),1)

 def test_auto_batch_control_and_packaging(self):
  h=(ROOT/'www/index.html').read_text();s=(ROOT/'www/offline-edit-ui.js').read_text();y=(ROOT/'codemagic.yaml').read_text()
  self.assertEqual(h.count('id="autoAll"'),1);self.assertIn("$('#autoAll').addEventListener('click',()=>armAuto())",s)
  self.assertIn('prepareAutoBatch',s);self.assertIn('createApprovedBatch',s);self.assertIn('cmp "$APP/public/auto-batch.js" www/auto-batch.js',y)
