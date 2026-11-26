@echo off
setlocal
cd /d "%~dp0.."
set PYTHONUTF8=1
chcp 65001 >nul
echo === DKP R4.7.1 - SOURCE CHECK OFFLINE ===
py -3 tools\r46_preflight.py --check
if errorlevel 1 goto :fail
py -3 -m unittest discover -s tests -p "test_*.py" -v
if errorlevel 1 goto :fail
where node >nul 2>&1
if errorlevel 1 goto :nonode
node --test tests/api.test.mjs tests/crypto.test.mjs tests/snapshot.test.mjs
if errorlevel 1 goto :fail
echo PASS - SOURCE TESTS ONLY. NOT AN IPHONE BUILD.
pause
exit /b 0
:nonode
echo PASS PYTHON - JS SKIPPED: Node.js 22 not found. Codemagic will test JS.
pause
exit /b 0
:fail
echo FAIL - SEE ABOVE
pause
exit /b 1
