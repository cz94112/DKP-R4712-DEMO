import json, os, sys, unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import r46_preflight as p
class R46Check(unittest.TestCase):
    def test_01_bundle_id_valid(self):self.assertEqual(p.bundle_id(),'vn.dkp.demo.capacitor.r44')
    def test_02_bundle_id_match(self):self.assertEqual(p.bundle_id(),p.get_yaml_signing_id())
    def test_03_source_check(self):self.assertEqual(p.check_source(),p.bundle_id())
    def test_04_private_package(self):self.assertTrue(json.loads(p.text('package.json'))['private'])
    def test_05_webdir(self):self.assertEqual(json.loads(p.text('capacitor.config.json'))['webDir'],'www')
    def test_06_unsigned_workflow(self):self.assertIn('r46-ios-compile-check:',p.text('codemagic.yaml'))
    def test_07_signed_workflow(self):self.assertIn('r46-ios-ad-hoc-signed-manual:',p.text('codemagic.yaml'))
    def test_08_unsigned_switch(self):self.assertIn('CODE_SIGNING_ALLOWED=NO',p.text('codemagic.yaml'))
    def test_09_no_automatic_publish(self):self.assertNotIn('publishing:',p.text('codemagic.yaml'))
    def test_10_no_automatic_trigger(self):self.assertNotIn('triggering:',p.text('codemagic.yaml'))
    def test_11_adhoc_only(self):self.assertIn('distribution_type: ad_hoc',p.text('codemagic.yaml'))
    def test_12_signing_profile_step(self):self.assertIn('xcode-project use-profiles',p.text('codemagic.yaml'))
    def test_13_no_secrets(self):self.assertIsNone(p.check_no_private_files())
    def test_14_no_signing_without_approval(self):
        with patch.dict(os.environ,{},clear=True):
            with self.assertRaises(ValueError):p.guard_signed()
    def test_15_no_wrong_bundle(self):
        with patch.dict(os.environ,{'DKP_SIGNING_READY':'YES','DKP_APPROVED_BUNDLE_ID':'vn.not.mine','DKP_DISTRIBUTION_TYPE':'AD_HOC'},clear=True):
            with self.assertRaises(ValueError):p.guard_signed()
    def test_16_no_wrong_distribution(self):
        with patch.dict(os.environ,{'DKP_SIGNING_READY':'YES','DKP_APPROVED_BUNDLE_ID':p.bundle_id(),'DKP_DISTRIBUTION_TYPE':'APP_STORE'},clear=True):
            with self.assertRaises(ValueError):p.guard_signed()
    def test_17_manual_gate_only(self):
        with patch.dict(os.environ,{'DKP_SIGNING_READY':'YES','DKP_APPROVED_BUNDLE_ID':p.bundle_id(),'DKP_DISTRIBUTION_TYPE':'AD_HOC'},clear=True):
            self.assertEqual(p.guard_signed(),p.bundle_id())
    def test_18_no_fake_ipa(self):self.assertFalse(list(ROOT.glob('**/*.ipa')))
    def test_19_no_ios_sources_prebuilt(self):self.assertFalse((ROOT/'ios').exists())
    def test_20_http_client_preserved(self):self.assertTrue((ROOT/'www/native-api.js').is_file())
if __name__=='__main__':unittest.main()
