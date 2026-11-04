@echo off
chcp 65001 >nul
rem 雙擊這個檔案：在 prototype 資料夾啟動本機伺服器，並用瀏覽器打開 1581 花蓮公車系統擴充模組原型。
rem 關掉這個黑色視窗，伺服器就會停止。
rem 專案位置與 Python 位置都是動態偵測，搬資料夾或換電腦不用改這個檔案。

rem 專案根目錄 = 這個 bat 所在的資料夾；原型在其下的 prototype
cd /d "%~dp0prototype"
if errorlevel 1 (
  echo.
  echo   找不到 prototype 資料夾：%~dp0prototype
  echo.
  pause
  exit /b 1
)

rem 動態找 Python：依序試 py 啟動器、python、再掃常見安裝位置
set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*") do (
    if exist "%%D\python.exe" set "PY=%%D\python.exe"
  )
)
if not defined PY (
  echo.
  echo   找不到 Python，請先安裝 Python 3 再重新執行。
  echo.
  pause
  exit /b 1
)

echo.
echo   專案位置：%~dp0
echo   原型伺服器啟動中……
echo   網址：http://localhost:8781/
echo   看完後，關掉這個視窗即可。
echo.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8781/"
"%PY%" -m http.server 8781
pause
