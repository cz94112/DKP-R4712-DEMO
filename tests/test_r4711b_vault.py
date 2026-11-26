from pathlib import Path
import unittest,re
ROOT=Path(__file__).resolve().parents[1]
class DeviceVaultSource(unittest.TestCase):
 def test_single_login_password(self):
  html=(ROOT/'www/index.html').read_text();self.assertEqual(re.findall(r'<input[^>]*type="password"[^>]*>',html),[re.search(r'<input id="loginPassword"[^>]*>',html).group(0),re.search(r'<input id="legacyPassword"[^>]*>',html).group(0)])
  self.assertNotRegex(html,r'id="(?:cachePass|editPass|passphrase)"')
 def test_keychain_native_registration(self):
  swift=(ROOT/'NativeVault/DKPVault.swift').read_text();self.assertIn('kSecAttrAccessibleWhenUnlockedThisDeviceOnly',swift);self.assertIn('SecRandomCopyBytes',swift);self.assertIn('registerPluginInstance(DKPVaultPlugin())',swift);self.assertNotIn('SecItemDelete',swift)
 def test_all_build_workflows_install_native(self):
  yaml=(ROOT/'codemagic.yaml').read_text();self.assertEqual(yaml.count('ruby tools/install_native_vault.rb'),3);self.assertIn('cmp "$APP/public/device-vault.js" www/device-vault.js',yaml)
 def test_login_and_logout_gate(self):
  s=(ROOT/'www/remote-ui.js').read_text();self.assertLess(s.index('await api.login(user,secret)'),s.index('await deviceVault.unlock()'));self.assertIn('finally{deviceVault.lock();clear();lockCache()',s)
 def test_no_js_key_persistence(self):
  s=(ROOT/'www/device-vault.js').read_text();self.assertNotRegex(s,r'localStorage|sessionStorage|console\.log|saveEncrypted');self.assertIn('(await keys()).length',s)
