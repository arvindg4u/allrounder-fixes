@echo off
set "SCRIPT=%USERPROFILE%\.local\bin\codex-auth-helpers.ps1"
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" kill_login %*
exit /b %ERRORLEVEL%
