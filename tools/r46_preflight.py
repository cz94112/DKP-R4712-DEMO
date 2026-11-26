#!/usr/bin/env python3
"""R4.6 offline, read-only source preflight. No Apple private files are read."""
import argparse
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
DEMO = 'vn.dkp.demo.capacitor.r44'
FORBIDDEN_EXTS={'.p12','.p8','.mobileprovision','.cer','.pem','.key','.keystore','.dkpenv','.sqlite3'}
FORBIDDEN_PARTS={'test_data_4b15','private_backups_encrypted'}
IGNORE_PARTS={'node_modules','.git','ios','android','__pycache__'}

def text(path):
    return (ROOT / path).read_text(encoding='utf-8')

def bundle_id():
    cfg=json.loads(text('capacitor.config.json'))
    val=cfg.get('appId','')
    if not re.fullmatch(r'[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){2,}',val):
        raise ValueError('Invalid Capacitor appId')
    return val

def get_yaml_signing_id():
    # Exact indented field under ios_signing, not a generic string match.
    y=text('codemagic.yaml')
    found=re.findall(r'^\s{8}bundle_identifier:\s*([A-Za-z0-9_.-]+)\s*$',y,re.MULTILINE)
    if len(found)!=1: raise ValueError('Expected exactly one signed bundle_identifier')
    return found[0]

def check_no_private_files():
    bad=[]
    for path in ROOT.rglob('*'):
        if not path.is_file() or IGNORE_PARTS.intersection(path.relative_to(ROOT).parts):
            continue
        parts={p.casefold() for p in path.relative_to(ROOT).parts}
        if FORBIDDEN_PARTS.intersection(parts) or path.suffix.lower() in FORBIDDEN_EXTS or path.name.startswith('.env'):
            bad.append(str(path.relative_to(ROOT)))
    if bad: raise ValueError('Sensitive or non-source files found: '+ ', '.join(bad[:10]))

def check_source():
    must=['package.json','codemagic.yaml','capacitor.config.json','www/index.html','www/native-api.js','www/vault-crypto.js','WindowsCheck/63_KIEM_TRA_R4_6_WINDOWS.cmd']
    for path in must:
        if not (ROOT/path).is_file(): raise ValueError('Missing '+path)
    j=json.loads(text('package.json'))
    if not j.get('private'): raise ValueError('package.json must be private')
    cfg=json.loads(text('capacitor.config.json'))
    if cfg.get('webDir')!='www': raise ValueError('Unexpected webDir')
    y=text('codemagic.yaml')
    if 'r46-ios-compile-check:' not in y or 'r46-ios-ad-hoc-signed-manual:' not in y:raise ValueError('Missing workflows')
    if 'publishing:' in y:raise ValueError('Auto publishing is not allowed')
    if bundle_id()!=get_yaml_signing_id():raise ValueError('Bundle ID mismatch: change BOTH config and Codemagic YAML')
    if 'distribution_type: ad_hoc' not in y:raise ValueError('Ad Hoc signing profile required')
    if 'CODE_SIGNING_ALLOWED=NO' not in y:raise ValueError('Unsigned simulator check absent')
    if 'xcode-project use-profiles' not in y:raise ValueError('Profile attachment missing')
    check_no_private_files()
    return bundle_id()

def guard_signed():
    bid=check_source()
    if os.environ.get('DKP_SIGNING_READY','')!='YES':
        raise ValueError('Signing locked: set DKP_SIGNING_READY=YES in Codemagic environment only when ready')
    if os.environ.get('DKP_APPROVED_BUNDLE_ID','')!=bid:
        raise ValueError('Bundle ID not approved; DKP_APPROVED_BUNDLE_ID must equal actual Apple App ID')
    if os.environ.get('DKP_DISTRIBUTION_TYPE','')!='AD_HOC':
        raise ValueError('Select Ad Hoc only with matching certificate and mobileprovision')
    # No guarantee signing exists: Codemagic must attach cert/profile and verify via Apple.
    return bid

def main():
    p=argparse.ArgumentParser()
    group=p.add_mutually_exclusive_group(required=True)
    group.add_argument('--check',action='store_true')
    group.add_argument('--guard-signed',action='store_true')
    args=p.parse_args()
    try:
        if args.check:
            bid=check_source()
            print('[PASS] R4.6 source safety check; bundle identifier:',bid)
            print('[NOTE] Does not prove Xcode builds, Apple signing, or iPhone operation')
            print('[BLOCK] Signed IPA requires matching valid Apple credentials and manual approval')
        else:
            bid=guard_signed()
            print('[PASS] Signing approval gate for '+bid+'; certificate/profile verified later by Codemagic')
    except (ValueError,OSError,KeyError,json.JSONDecodeError) as e:
        print('[BLOCK] R4.6 preflight:',e,file=sys.stderr)
        return 2
    return 0
if __name__=='__main__':sys.exit(main())
