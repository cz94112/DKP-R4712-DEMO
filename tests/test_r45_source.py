"""Offline read-only source assertions for R4.5; no Apple or Windows server access."""
from pathlib import Path
import json, unittest
ROOT=Path(__file__).resolve().parent.parent
WEB=ROOT/'www'
def get(n):return (WEB/n).read_text(encoding='utf-8')
class CheckR45(unittest.TestCase):
    def test_01_package_version(self):
        self.assertEqual(json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version'],'0.4.7-12')
    def test_02_native_http(self):self.assertIn('CapacitorHttp',get('native-api.js'))
    def test_03_native_gate(self):self.assertIn('isNativePlatform()',get('native-api.js'))
    def test_04_no_browser_fallback(self):self.assertNotIn('fetch(',get('native-api.js'))
    def test_05_no_password_storage(self):
        self.assertNotIn('localStorage',get('native-api.js')+get('remote-ui.js'))
        self.assertNotIn('sessionStorage',get('native-api.js')+get('remote-ui.js'))
    def test_06_allowlisted_host(self):self.assertIn('DEMO_URL',get('native-api.js'))
    def test_07_redirects_disabled(self):self.assertIn('disableRedirects:true',get('native-api.js'))
    def test_08_login_path(self):self.assertIn("login:'/api/login'",get('native-api.js'))
    def test_09_read_page_path(self):self.assertIn('/api/vehicles/page?page=1&size=20',get('native-api.js'))
    def test_10_revision_preflight(self):self.assertIn("revision:'/api/state/revision'",get('native-api.js'))
    def test_11_no_write_state(self):
        self.assertNotIn('/api/state\'',''+get('native-api.js'))
        self.assertNotIn('/api/vehicles/DEMO',get('native-api.js'))
    def test_12_strict_fake_dataset(self):self.assertIn("page.total!==3",get('native-api.js'))
    def test_13_login_cookie_check(self):self.assertIn('const snapshot=await this.fetchDemoPage();',get('native-api.js'))
    def test_14_logout_server(self):self.assertIn("logout:'/api/logout'",get('native-api.js'))
    def test_15_no_auto_sync(self):
        self.assertNotIn('sync-draft',get('native-api.js')+get('remote-ui.js'))
    def test_16_ui_no_innerHTML(self):self.assertNotIn('.innerHTML',get('remote-ui.js'))
    def test_17_no_secret_in_repo(self):
        names=[p.name.lower() for p in ROOT.rglob('*') if p.is_file()]
        self.assertFalse(any(p.endswith(('.p12','.mobileprovision','.p8','.pem','.sqlite3')) for p in names))
    def test_18_local_vault_unchanged(self):self.assertIn('dkp-capacitor-r44-demo-v1',get('vault-storage.js'))
    def test_19_no_external_server_embedded(self):self.assertFalse((ROOT/'app/server.py').exists())
    def test_20_csp_exists(self):self.assertIn('Content-Security-Policy',get('index.html'))
    def test_21_no_cookie_exfil(self):self.assertNotIn('document.cookie',get('native-api.js')+get('remote-ui.js'))
    def test_22_dom_password_cleared(self):self.assertIn("$('#loginPassword').value=''",get('remote-ui.js'))
    def test_23_web_login_disabled(self):self.assertIn('||!nativeReady',get('remote-ui.js'))
    def test_24_codmagic_secrets_external(self):
        data=(ROOT/'codemagic.yaml').read_text(encoding='utf-8')
        self.assertIn('ios_signing:',data)
        self.assertNotIn('-----BEGIN',data)
if __name__=='__main__':unittest.main(verbosity=2)
