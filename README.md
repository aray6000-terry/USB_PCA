# 企業每月零用金申請與核銷系統 (Petty Cash Management System)

本系統為一套具備角色權限控管 (RBAC)、發票憑證管理、核銷審核日誌追蹤，以及與 **Google 試算表 (Google Sheets / Google Apps Script)** 雙向同步的企業級零用金管理解決方案。

---

## 🌟 核心特色與功能

1. **角色權限劃分 (RBAC)**：
   - **超級管理者 (Admin)**：全系統監控、所有申請單總覽、帳號審核與管理、系統全域設定與同步設定。
   - **財務審核人員 (Accountant)**：零用金單據審核（核准、自訂核准金額、駁回並填寫理由）、支出審計紀錄查閱、Google Sheets 同步。
   - **一般同仁 (Employee)**：個人零用金線上填報、單據歷程追蹤、狀態即時更新。

2. **發票憑證與單據管理**：
   - 支援單據圖片上傳（JPEG, PNG, WebP），並提供即時原圖預覽與互動放大檢視器。
   - 智慧單號編碼（如 `EXP-YYYYMM-XXX`），完整保存申請細項、用途、金額及憑證附件。

3. **審核流程與審計日誌 (Audit Trail)**：
   - 財務審核時可調整實際核銷金額並留下審核備註。
   - 任何金額變更與狀態流轉皆會留存審計日誌，可追溯異動人與時間。

4. **Google Sheets / Apps Script (GAS) 整合**：
   - 支援將申請核銷紀錄雙向同步至雲端 Google 試算表。
   - 內建 `google_apps_script/Code.gs` 後端腳本，提供 Webhook 接收與同步功能。

5. **預算監控與儀表板**：
   - 當月累計申請與核准金額動態統計。
   - 超過設定之每月預算門檻時自動發出預警提示。

---

## 📁 專案目錄結構

```text
├── data/                   # 本地 JSON 資料庫、上傳憑證圖檔與審計日誌
│   ├── database.json       # 核心資料庫 (含初始管理者與測試資料)
│   ├── uploads/            # 憑證發票圖片儲存目錄
│   └── logs/               # 系統審計異動紀錄
├── google_apps_script/     # Google Apps Script 雲端試算表串接腳本
│   └── Code.gs
├── public/                 # 前端靜態頁面與互動邏輯
│   ├── index.html          # 主系統介面
│   ├── app.js              # 前端邏輯 (表單控制、驗證、即時渲染)
│   └── styles.css          # 系統視覺樣式
├── server/                 # 後端 Express 服務
│   ├── server.js           # 伺服器主入口
│   ├── db.js               # 資料存取與初始化邏輯
│   ├── auth.js             # JWT 身份驗證中介層
│   └── routes/             # RESTful API 路由
├── scratch/                # 系統功能驗證與測試腳本
├── 啟動系統.bat             # Windows 一鍵啟動腳本
├── package.json            # 依賴套件定義
├── .env.example            # 環境變數範例檔
└── README.md
```

---

## 🚀 快速開始

### 1. 系統需求
- [Node.js](https://nodejs.org/) (v16 以上，建議 LTS 版本)
- Windows / macOS / Linux

### 2. 安裝依賴套件
```bash
npm install
```

### 3. 環境變數設定
複製 `.env.example` 為 `.env` 並視需求調整：
```bash
cp .env.example .env
```
主要參數說明：
- `PORT`：後端服務埠號（預設為 `3050`）
- `JWT_SECRET`：JWT 簽署金鑰
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_SPREADSHEET_ID`：Google 試算表 API 認證資訊（選填）

### 4. 啟動系統
- **方法一（Windows 捷徑）**：直接雙擊根目錄的 `啟動系統.bat`
- **方法二（指令列啟動）**：
  ```bash
  npm start
  ```
啟動後於瀏覽器開啟：`http://localhost:3050`

---

## 👥 系統帳號與權限說明

系統採用嚴格角色權限劃分 (RBAC)：
- **系統最高管理員**：`terry` (預設管理員帳號)
- **企業同仁與審核人員**：
  - 可透過登入頁籤的「**申請新帳號 ✨**」線上提交開通申請，由管理者核可後立即生效。
  - 亦可直接於 **Google 試算表（人員權限與帳號名冊）** 維護名單，系統將自動雙向即時連動。

---

## 📄 授權條款
MIT License
