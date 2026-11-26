"""Windows read-only static checks – never calls the server, modifies DB, or signs iOS."""
from pathlib import Path
import hashlib,json,re,unittest,zipfile
ROOT=Path(__file__).resolve().parent.parent
WEB=ROOT/'www'
class CheckR44(unittest.TestCase):
 def test_01_package(self):
  data=json.loads((ROOT/'package.json').read_text(encoding='utf8'))
  self.assertEqual(data['name'],'dangkiemxepro-r45-capacitor-demo')
 def test_02_capacitor(self):
  cfg=json.loads((ROOT/'capacitor.config.json').read_text(encoding='utf8'))
  self.assertEqual(cfg['webDir'],'www')
 def test_03_no_remote_wrapper(self):
  cfg=json.loads((ROOT/'capacitor.config.json').read_text(encoding='utf8'))
  self.assertNotIn('server',cfg)
 def test_04_demo_id(self):
  self.assertIn('demo',json.loads((ROOT/'capacitor.config.json').read_text(encoding='utf8'))['appId'])
 def test_05_html(self):self.assertIn('<head>',(WEB/'index.html').read_text(encoding='utf8'))
 def test_06_csp(self):self.assertIn('Content-Security-Policy',(WEB/'index.html').read_text(encoding='utf8'))
 def test_07_https_lock(self):self.assertIn("url.protocol !== 'https:'",(WEB/'validations.js').read_text(encoding='utf-8'))
 def test_08_host_lock(self):self.assertIn('recede-putdown-hardy.ngrok-free.dev',(WEB/'validations.js').read_text(encoding='utf-8'))
 def test_09_vehicles_fake(self):self.assertEqual((WEB/'validations.js').read_text(encoding='utf-8').count("id:'DEMO-"),3)
 def test_10_pbkdf2(self):self.assertIn('PBKDF2',(WEB/'vault-crypto.js').read_text(encoding='utf-8'))
 def test_11_aes_gcm(self):self.assertIn('AES-GCM',(WEB/'vault-crypto.js').read_text(encoding='utf-8'))
 def test_12_iv_random(self):self.assertIn('getRandomValues(new Uint8Array(12))',(WEB/'vault-crypto.js').read_text(encoding='utf-8'))
 def test_13_salt_random(self):self.assertIn('getRandomValues(new Uint8Array(16))',(WEB/'vault-crypto.js').read_text(encoding='utf-8'))
 def test_14_no_persist_password(self):self.assertNotIn('localStorage',(WEB/'app.js').read_text(encoding='utf-8'))
 def test_15_idb_storage(self):self.assertIn('indexedDB',(WEB/'vault-storage.js').read_text(encoding='utf-8'))
 def test_16_no_auto_sync(self):self.assertNotIn('/api/test-4b213/sync-draft',(WEB/'app.js').read_text(encoding='utf-8'))
 def test_17_health_only(self):self.assertIn("DEMO_URL+'/healthz'",(WEB/'app.js').read_text(encoding='utf-8'))
 def test_18_packaged_app_icon(self):self.assertTrue((WEB/'icon-192.png').stat().st_size>1000)
 def test_19_codmagic_no_secret(self):
  cm=(ROOT/'codemagic.yaml').read_text(encoding='utf-8')
  self.assertIn('ios_signing:',cm)
  self.assertNotIn('-----BEGIN PRIVATE KEY-----',cm)
 def test_20_no_private_data(self):
  names=[p.name.lower() for p in ROOT.rglob('*') if p.is_file()]
  self.assertFalse(any(x.endswith(('.sqlite3','.p12','.mobileprovision','.pem','.p8')) for x in names))
 def test_21_js_modules(self):
  self.assertTrue(all((WEB/p).exists() for p in ['app.js','vault-crypto.js','vault-storage.js','validations.js']))
 def test_22_no_embedded_server(self):self.assertFalse(any((ROOT/p).exists() for p in ['app/server.py','run.py','test_data_4b15']))
 def test_23_separate_vault(self):self.assertIn('dkp-capacitor-r44-demo-v1',(WEB/'vault-storage.js').read_text(encoding='utf-8'))
 def test_24_no_plaintext_logs(self):self.assertNotIn('console.log',(WEB/'vault-crypto.js').read_text(encoding='utf-8'))
if __name__=='__main__':unittest.main(verbosity=2)
