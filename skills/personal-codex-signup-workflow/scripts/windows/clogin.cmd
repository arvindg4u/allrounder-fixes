@echo off
codex login --device-auth %*
exit /b %ERRORLEVEL%
