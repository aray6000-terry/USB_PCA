@echo off
chcp 65001 > nul
title 每月零用金申請與核銷系統

echo ====================================================
echo 🚀 正在啟動 每月零用金申請與核銷系統...
echo ====================================================

set "NODE_EXE=d:\#1_GOOGLE_Antigravity\tools\node\node.exe"
if not exist "%NODE_EXE%" (
    echo 找不到 Node.js 執行檔，使用系統預設 node...
    set "NODE_EXE=node"
)

echo 伺服器啟動中，請稍候...
"%NODE_EXE%" server/server.js

pause
