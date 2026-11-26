from pathlib import Path
from html.parser import HTMLParser
import unittest
R=Path(__file__).resolve().parents[1]
class IDs(HTMLParser):
 def __init__(self):super().__init__();self.ids=[];self.jumps=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.append(a['id'])
  if 'data-jump' in a:self.jumps.append(a['data-jump'])
class LayoutSource(unittest.TestCase):
 def test_ids_and_navigation(self):
  p=IDs();p.feed((R/'www/index.html').read_text());self.assertEqual(len(p.ids),len(set(p.ids)));self.assertEqual(len(p.jumps),3);self.assertTrue(set(p.jumps)<=set(p.ids))
 def test_native_fallback_and_css_no_sum(self):
  s=(R/'NativeVault/DKPVault.swift').read_text();self.assertIn('webView.safeAreaInsets',s);self.assertIn('DispatchQueue.main.async',s);self.assertIn('CAPPluginMethod(name: "readSafeArea"',s)
  css=(R/'www/style.css').read_text();self.assertIn('max(env(safe-area-inset-top,0px),var(--native-top,0px))',css);self.assertIn('[hidden]{display:none!important}',css)
 def test_controls_still_present(self):
  html=(R/'www/index.html').read_text();self.assertLess(html.index('id="editForm"'),html.index('id="editList"'));self.assertIn('id="editHeading" tabindex="-1"',html);self.assertIn('id="networkSettings"',html)
 def test_packaging_integrity(self):
  y=(R/'codemagic.yaml').read_text();self.assertIn('cmp "$APP/public/layout-ui.js" www/layout-ui.js',y);self.assertIn('cmp "$APP/public/style.css" www/style.css',y);self.assertIn('cmp "$APP/public/index.html" www/index.html',y)
