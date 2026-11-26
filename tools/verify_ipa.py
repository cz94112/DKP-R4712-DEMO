"""Read-only IPA archive verification against the packaged source. No signing."""
import argparse, json, plistlib, sys, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def verify(path, root=ROOT):
    expected = json.loads((root / 'capacitor.config.json').read_text(encoding='utf-8'))['appId']
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        if len(names) != len(set(names)) or z.testzip() is not None:
            raise ValueError('Duplicate or corrupt IPA entries')
        prefix = 'Payload/App.app/'
        plist = plistlib.loads(z.read(prefix + 'Info.plist'))
        if plist.get('CFBundleIdentifier') != expected:
            raise ValueError('Unexpected bundle identifier')
        exe = plist.get('CFBundleExecutable')
        if not isinstance(exe, str) or not exe or '/' in exe or '\\' in exe or exe in ('.','..'):
            raise ValueError('Invalid executable name')
        if z.getinfo(prefix + exe).file_size == 0:
            raise ValueError('Empty app executable')
        count = 0
        for file in sorted((root / 'www').rglob('*')):
            if file.is_file():
                name = prefix + 'public/' + file.relative_to(root / 'www').as_posix()
                if z.read(name) != file.read_bytes():
                    raise ValueError('Source mismatch: ' + name)
                count += 1
        return count

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ipa', type=Path)
    args = parser.parse_args()
    try:
        print(f'PASS: IPA archive, bundle ID and {verify(args.ipa)} web assets match source.')
        print('Not a signing, Xcode runtime, or real iPhone acceptance test.')
    except (ValueError, OSError, KeyError, zipfile.BadZipFile, plistlib.InvalidFileException) as e:
        print(f'FAIL: {e}', file=sys.stderr)
        sys.exit(1)
