

@echo off
cd /d "%~dp0"

echo Starting Don't Forget local server...
echo Keep this window open while using the website.
echo.

npx --yes http-server -p 8123 -c-1

pause


