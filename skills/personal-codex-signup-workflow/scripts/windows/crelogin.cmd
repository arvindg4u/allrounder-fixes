@echo off
set "SCRIPT=%USERPROFILE%\.local\bin\codex-auth-helpers.ps1"
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" login_link_bg %*
exit /b %ERRORLEVEL%
