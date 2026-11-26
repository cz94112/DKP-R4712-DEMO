from pathlib import Path
import importlib.util, json, plistlib, tempfile, unittest, zipfile
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('verify_ipa', ROOT/'tools/verify_ipa.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

class ReleaseCheck(unittest.TestCase):
    def create(self, root, *, bundle='vn.dkp.demo.capacitor.r44', asset=b'hello', executable=b'fake'):
        (root/'www').mkdir(); (root/'www/index.html').write_bytes(b'hello')
        (root/'capacitor.config.json').write_text(json.dumps({'appId':'vn.dkp.demo.capacitor.r44'}))
        ipa=root/'test.ipa'; prefix='Payload/App.app/'
        with zipfile.ZipFile(ipa,'w') as z:
            z.writestr(prefix+'Info.plist',plistlib.dumps({'CFBundleIdentifier':bundle,'CFBundleExecutable':'App'}))
            z.writestr(prefix+'App',executable); z.writestr(prefix+'public/index.html',asset)
        return ipa
    def test_matching_fixture(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t); self.assertEqual(mod.verify(self.create(root),root),1)
    def test_wrong_bundle(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            with self.assertRaisesRegex(ValueError,'bundle identifier'): mod.verify(self.create(root,bundle='wrong'),root)
    def test_modified_asset(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            with self.assertRaisesRegex(ValueError,'Source mismatch'): mod.verify(self.create(root,asset=b'changed'),root)
    def test_empty_executable(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            with self.assertRaisesRegex(ValueError,'Empty app executable'): mod.verify(self.create(root,executable=b''),root)
    def test_workflow(self):
        y=(ROOT/'codemagic.yaml').read_text()
        self.assertIn('r4712-ios-device-unsigned:',y)
        self.assertIn('tools/verify_ipa.py',y); self.assertIn('dist/SHA256_R4712.txt',y)
        self.assertNotIn('publishing:',y)
