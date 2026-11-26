from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class OfflineEditSource(unittest.TestCase):
 def test_ui_wired(self):
  ui=(ROOT/'www/remote-ui.js').read_text(); self.assertIn('editButton(v.id)',ui); self.assertIn('initEditUI(nativeReady)',ui);self.assertIn('setEditSnapshot(null)',ui)
 def test_ui_elements_present(self):
  html=(ROOT/'www/index.html').read_text()
  for id in ['editStatus','editList','editForm','editDue','editNote','editSave','editCancel','editBase']:self.assertEqual(html.count('id="'+id+'"'),1)
 def test_no_network_or_plaintext_persistence_in_new_modules(self):
  s=''.join((ROOT/'www'/p).read_text() for p in ['offline-edits.js','offline-edit-ui.js'])
  for banned in ['fetch(', 'XMLHttpRequest','localStorage','sessionStorage','/api/','CapacitorHttp']:self.assertNotIn(banned,s)
 def test_packaging_integrity_checks(self):
  s=(ROOT/'codemagic.yaml').read_text();self.assertIn('cmp "$APP/public/offline-edits.js" www/offline-edits.js',s);self.assertIn('cmp "$APP/public/offline-edit-ui.js" www/offline-edit-ui.js',s)
