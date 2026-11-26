@echo off
setlocal
cd /d "%~dp0.."
set PYTHONUTF8=1
echo === DKP R4.5 - KIEM TRA MA NGUON OFFLINE ===
py -3 -m unittest discover -s tests -p "test_*.py" -v
if errorlevel 1 (echo R4.5 CHUA DAT& pause& exit /b 1)
echo R4.5 SOURCE CHECK DAT - CHUA CO IPA.
echo NOTE: Chua thu dang nhap/cookie tren iPhone that.
pause
