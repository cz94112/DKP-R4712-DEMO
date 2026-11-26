from pathlib import Path
import unittest
R=Path(__file__).resolve().parents[1]
class RememberSource(unittest.TestCase):
 def test_no_password_or_token_storage(self):
  js=(R/'www/remember-session.js').read_text();self.assertNotIn('localStorage',js);self.assertNotIn('sessionStorage',js);self.assertNotIn('document.cookie',js)
 def test_keychain_separate_marker_and_key(self):
  swift=(R/'NativeVault/DKPVault.swift').read_text();self.assertIn('remembered-demo-login-v1',swift);self.assertIn('local-encryption-secret',swift);self.assertIn('writeLogin(0, call)',swift);self.assertIn('28_800_000',swift)
 def test_login_marker_only_after_validated_login(self):
  ui=(R/'www/remote-ui.js').read_text();self.assertLess(ui.index('await api.login(user,secret)'),ui.index('await rememberedSession.remember()'));self.assertIn("window.addEventListener('online'",ui);self.assertIn('await rememberedSession.forget()',ui)
 def test_packaged_module(self):
  self.assertIn('cmp "$APP/public/remember-session.js" www/remember-session.js',(R/'codemagic.yaml').read_text())
