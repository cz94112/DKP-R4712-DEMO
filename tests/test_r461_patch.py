from pathlib import Path
import json, unittest
ROOT=Path(__file__).resolve().parents[1]
class PatchTests(unittest.TestCase):
 def test_insets_single_owner(self):
  self.assertEqual(json.loads((ROOT/'capacitor.config.json').read_text())['ios']['contentInset'],'never')
  css=(ROOT/'www/style.css').read_text(); self.assertIn('body{position:fixed;inset:env(safe-area-inset-top',css);self.assertIn('overflow-y:auto',css);self.assertIn('safe-area-inset-bottom',css)
  self.assertIn('viewport-fit=cover',(ROOT/'www/index.html').read_text())
 def test_unsigned_device_workflow(self):
  y=(ROOT/'codemagic.yaml').read_text();self.assertIn('r4712-ios-device-unsigned:',y);self.assertIn('-sdk iphoneos',y);self.assertIn('CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO',y);self.assertIn('dist/DKP_R4712_DEMO_UNSIGNED.ipa',y);self.assertNotIn('publishing:',y)
 def test_ui_uses_plate(self):
  self.assertIn('strong.textContent=vehicle.plate;', (ROOT/'www/remote-ui.js').read_text())
 def test_vault_uses_original_uppercase_demo_ids(self):
  self.assertIn("id:'DEMO-001'",(ROOT/'www/validations.js').read_text());self.assertIn('dkp-capacitor-r44-demo-v1',(ROOT/'www/vault-storage.js').read_text())
