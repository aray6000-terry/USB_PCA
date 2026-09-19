const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const googleSheetService = require('../services/googleSheetService');

router.use(authenticateToken);

// 1. 取得 Google Sheets 同步安全狀態 (不洩漏機密私鑰與完整 ID)
router.get('/status', (req, res) => {
  try {
    const status = googleSheetService.getPublicStatus();
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, message: '讀取 Google Sheets 狀態失敗' });
  }
});

// 2. 取得 Google Apps Script Code.gs 範本程式碼 (供前端一鍵複製)
router.get('/code-gs', requireRole('accountant', 'admin'), (req, res) => {
  try {
    const codeGsPath = path.join(__dirname, '../../google_apps_script/Code.gs');
    if (fs.existsSync(codeGsPath)) {
      const code = fs.readFileSync(codeGsPath, 'utf8');
      res.json({ success: true, code });
    } else {
      res.status(404).json({ success: false, message: '找不到 Code.gs 檔案' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: '讀取 Code.gs 失敗: ' + err.message });
  }
});

// 3. 測試 Google Sheets 連線 (會計與超級使用者可執行)
router.post('/test', requireRole('accountant', 'admin'), async (req, res) => {
  try {
    const { gas_url } = req.body || {};
    let result;
    if (gas_url) {
      result = await googleSheetService.testGasConnection(gas_url);
    } else {
      result = await googleSheetService.testConnection();
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. 手動全量同步至 Google Sheets
router.post('/sync', requireRole('accountant', 'admin'), async (req, res) => {
  try {
    const result = await googleSheetService.syncAllClaims();
    res.json({
      success: true,
      message: `全量同步完成！共同步 ${result.synced_count} 筆申請紀錄至 Google 試算表`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `同步失敗: ${err.message}` });
  }
});

// 5. 更新 Google Sheets 設定 (支援 Google Apps Script URL 或 Service Account，限超級使用者 admin)
router.post('/config', requireRole('admin'), async (req, res) => {
  try {
    const {
      gas_url,
      email,
      private_key,
      spreadsheet_id,
      sheet_name,
      drive_folder_id
    } = req.body;

    const updatePayload = {
      google_sheet_enabled: true
    };

    if (gas_url !== undefined) {
      updatePayload.google_gas_url = (gas_url || '').trim();
    }
    if (email !== undefined && email.trim()) {
      updatePayload.google_service_account_email = email.trim();
    }
    if (private_key !== undefined && private_key.trim()) {
      updatePayload.google_private_key = private_key.trim();
    }
    if (spreadsheet_id !== undefined && spreadsheet_id.trim()) {
      updatePayload.google_spreadsheet_id = spreadsheet_id.trim();
    }
    if (drive_folder_id !== undefined) {
      updatePayload.google_drive_folder_id = (drive_folder_id || '').trim();
    }
    if (sheet_name !== undefined && sheet_name.trim()) {
      updatePayload.google_sheet_name = sheet_name.trim();
    }

    db.updateConfig(updatePayload);

    // 儲存後立即測試連線
    const testResult = await googleSheetService.testConnection();

    res.json({
      success: true,
      message: testResult.success
        ? 'Google Sheets 設定已儲存且連線測試成功！'
        : `Google Sheets 設定已儲存，但連線測試提示：${testResult.message}`,
      testResult
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '儲存設定失敗: ' + err.message });
  }
});

module.exports = router;
