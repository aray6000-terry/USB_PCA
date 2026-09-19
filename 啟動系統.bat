@echo off
chcp 65001 > nul
title 每月零用金申請與核銷系統
cd /d "%~dp0"

echo ====================================================
echo 🚀 正在啟動 每月零用金申請與核銷系統...
echo ====================================================

set "NODE_EXE=d:\#1_GOOGLE_Antigravity\tools\node\node.exe"
if not exist "%NODE_EXE%" (
    echo 找不到專用 Node.js 執行檔，切換至系統預設 node...
    set "NODE_EXE=node"
)

echo.
echo 🌐 [1/2] 正在為您開啟瀏覽器操作網頁 (http://localhost:3050)...
start "" "http://localhost:3050"

echo ⚙️  [2/2] 伺服器啟動中 (注意：使用系統時請保持此黑色視窗開啟)...
echo.
"%NODE_EXE%" server/server.js

pause
