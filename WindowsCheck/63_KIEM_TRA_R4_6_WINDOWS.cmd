@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
echo === DANG KIEM XE PRO R4.6 - KIEM TRA WINDOWS (CHi DOC) ===
echo KHONG CAI/KY/BUILD IPA, KHONG SUA M4, KHONG KET NOI SERVER.
py -3 tools\r46_preflight.py --check
if errorlevel 1 goto :fail
py -3 -m unittest discover -s tests -p test_r46_*.py -v
if errorlevel 1 goto :fail
echo.
echo R4.6 SOURCE CHECK DAT - CHUA CO IPA. DUNG TAI DAY.
goto :done
:fail
echo.
echo R4.6 CHUA DAT - XEM LOI PHIA TREN.
:done
pause
endlocal
