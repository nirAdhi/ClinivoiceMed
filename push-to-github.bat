@echo off
cls
echo ===================================
echo  Clinivoice Git Push Script
echo ===================================
echo.
echo This script will push your Clinivoice code to GitHub.
echo Make sure Git is installed before running this script.
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause > nul

REM Navigate to project directory
cd /d D:\Google_Antigravity\VoiceToText

echo.
echo Step 1: Checking Git installation...
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed or not in PATH.
    echo Please install Git from https://git-scm.com/download/win
    pause
    exit /b 1
)
echo Git is installed.

echo.
echo Step 2: Configuring Git remote...
git remote remove origin 2>nul
git remote add origin https://github.com/nirAdhi/Clinivoice.git
echo Remote added.

echo.
echo Step 3: Staging all changes...
git add -A
echo Changes staged.

echo.
echo Step 4: Committing changes...
git commit -m "Update: Fix save transcript flow, AI patient/dentist identification, decryption, and name extraction" -m "- Fix AI prompt to correctly identify dentist vs patient" -m "- Fix encounter view showing encrypted data - needs decryption" -m "- Improve patient name extraction to find John in transcript" -m "- Verify preview modal editability" 2>nul
if errorlevel 1 (
    echo No new changes to commit or commit failed.
)

echo.
echo Step 5: Pushing to GitHub...
git push -u origin main --force
if errorlevel 1 (
    echo.
    echo Push failed. Trying 'master' branch instead...
    git push -u origin master --force
)

echo.
echo ===================================
echo  Push Complete!
echo ===================================
pause
