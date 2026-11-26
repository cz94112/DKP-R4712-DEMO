@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
echo === DKP R4.6 - KIEM TRA CAU HINH KY IPA (CHI DOC) ===
py -3 tools\r46_preflight.py --check
if errorlevel 1 goto :fail
echo.
echo [BLOCK] CHUA DU DIEU KIEN KY: chua xac minh P12, provisioning profile, UDID, bundle ID.
echo [NOTE] Cau hinh ky tren Codemagic, KHONG chep P12/mat khau vao thu muc nay.
goto :done
:fail
echo R4.6 CAN SUA MA NGUON/CAU HINH TRUOC KHI CHUAN BI KY.
:done
pause
endlocal
