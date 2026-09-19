const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const securityService = require('../services/securityService');
const googleSheetService = require('../services/googleSheetService');
const googleDriveService = require('../services/googleDriveService');
const aiReceiptService = require('../services/aiReceiptService');
const auditLogService = require('../services/auditLogService');

const fs = require('fs');
const path = require('path');

// 發票憑證圖片專屬讀取端點 (允許 <img> 標籤直接載入，不受限於 Bearer Token 標頭)
router.get('/:id/receipt', (req, res) => {
  try {
    const claim = db.findClaimById(req.params.id);
    if (!claim) {
      return res.status(404).send('找不到該申請單');
    }

    if (!claim.receipt_url) {
      return res.status(404).send('此申請單無發票憑證相片');
    }

    const receiptUrl = claim.receipt_url;

    // 統一設定開放跨網域與跨來源資源讀取
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 1. 若為 Base64 格式
    if (receiptUrl.startsWith('data:image/')) {
      const matches = receiptUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const imgBuffer = Buffer.from(matches[2], 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(imgBuffer);
      }
    }

    // 2. 若為本地 uploads 檔案
    const uploadsDir = path.join(__dirname, '../../data/uploads');
    let localFileName = '';

    if (receiptUrl.includes('/uploads/')) {
      localFileName = path.basename(receiptUrl);
    } else if (!receiptUrl.startsWith('http')) {
      localFileName = path.basename(receiptUrl);
    }

    if (localFileName) {
      const localFilePath = path.join(uploadsDir, localFileName);
      if (fs.existsSync(localFilePath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.sendFile(path.resolve(localFilePath));
      }
    }

    // 3. 容錯備援：檢查 uploads 目錄中是否有包含該單號的相片
    const allUploads = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
    const matchedFile = allUploads.find(f => f.startsWith(claim.claim_no));
    if (matchedFile) {
      const fallbackPath = path.join(uploadsDir, matchedFile);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(path.resolve(fallbackPath));
    }

    // 4. 若為外部 URL (例如 Google Drive 網址)
    if (receiptUrl.startsWith('http://') || receiptUrl.startsWith('https://')) {
      // 若為 Google Drive view 網址，嘗試轉為直接預覽串流
      const driveMatch = receiptUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (driveMatch && driveMatch[1]) {
        const directUrl = `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
        return res.redirect(directUrl);
      }
      return res.redirect(receiptUrl);
    }

    res.status(404).send('憑證檔案不存在或已被移除');
  } catch (err) {
    console.error('Fetch receipt image error:', err);
    res.status(500).send('載入憑證圖片時發生錯誤: ' + err.message);
  }
});

// 發票憑證 Base64 格式兜底讀取端點 (前端跨域或特殊瀏覽器環境之終極備援)
router.get('/:id/receipt-base64', (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const claim = db.findClaimById(req.params.id);
    if (!claim || !claim.receipt_url) {
      return res.status(404).json({ success: false, message: '無憑證照片' });
    }

    const receiptUrl = claim.receipt_url;
    if (receiptUrl.startsWith('data:image')) {
      return res.json({ success: true, base64: receiptUrl });
    }

    const uploadsDir = path.join(__dirname, '../../data/uploads');
    let localFileName = path.basename(receiptUrl);
    let localFilePath = path.join(uploadsDir, localFileName);
    if (!fs.existsSync(localFilePath)) {
      const allUploads = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
      const matched = allUploads.find(f => f.startsWith(claim.claim_no));
      if (matched) localFilePath = path.join(uploadsDir, matched);
    }

    if (fs.existsSync(localFilePath)) {
      const ext = path.extname(localFilePath).toLowerCase().replace('.', '') || 'jpeg';
      const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
      const buf = fs.readFileSync(localFilePath);
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      return res.json({ success: true, base64: dataUrl });
    }

    return res.status(404).json({ success: false, message: '本機憑證檔案不存在' });
  } catch (err) {
    console.error('Fetch receipt base64 error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 以下申請單路由均需先通過 JWT 驗證
router.use(authenticateToken);

// 0. 查詢金額異動稽核 Log 檔 (僅限會計與超級使用者)
router.get('/approval-logs', requireRole('accountant', 'admin'), (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const logs = auditLogService.getRecentLogs(limit);
    const fileInfo = auditLogService.getLogFileInfo();
    res.json({
      success: true,
      fileInfo,
      logs
    });
  } catch (err) {
    console.error('Fetch approval logs error:', err);
    res.status(500).json({ success: false, message: '讀取金額異動 Log 檔失敗: ' + err.message });
  }
});

// 0-1. 下載實體 approval_changes.log 檔案 (僅限會計與超級使用者)
router.get('/approval-logs/download', requireRole('accountant', 'admin'), (req, res) => {
  try {
    const { filePath, fileName, exists } = auditLogService.getLogFileInfo();
    if (!exists) {
      return res.status(404).json({ success: false, message: '目前尚無金額異動 Log 檔紀錄' });
    }
    res.download(filePath, fileName);
  } catch (err) {
    console.error('Download approval logs error:', err);
    res.status(500).json({ success: false, message: '下載 Log 檔失敗: ' + err.message });
  }
});

// 1. 取得申請單清單 (落實 RBAC 權限資料隔離)
router.get('/', (req, res) => {
  try {
    const { month, category, status, keyword, user_id } = req.query;
    const filter = { month, category, status, keyword };

    // RBAC: 一般員工強制只能看到自己的申請單
    if (req.user.role === 'employee') {
      filter.user_id = req.user.id;
    } else if (user_id) {
      // 會計與超級使用者可選擇特定同仁篩選
      filter.user_id = user_id;
    }

    const claims = db.listClaims(filter);

    res.json({
      success: true,
      total: claims.length,
      claims
    });
  } catch (err) {
    console.error('List claims error:', err);
    res.status(500).json({ success: false, message: '查詢申請單失敗' });
  }
});

// 2. 儀表板統計數據 (依角色自動分流個人 vs 全公司)
router.get('/stats', (req, res) => {
  try {
    const { month } = req.query;
    const currentMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const filter = { month: currentMonth };
    if (req.user.role === 'employee') {
      filter.user_id = req.user.id;
    }

    const claims = db.listClaims(filter);

    let totalAmount = 0;
    let pendingCount = 0;
    let pendingAmount = 0;
    let approvedCount = 0;
    let approvedAmount = 0;
    let disbursedCount = 0;
    let disbursedAmount = 0;
    let rejectedCount = 0;

    const categoryBreakdown = {
      '交通': 0,
      '餐食': 0,
      '設備': 0,
      '交際費': 0,
      '清潔及庶務用品': 0,
      '其他': 0
    };

    let accApprovedCount = 0;
    let accApprovedAmount = 0;

    claims.forEach(c => {
      totalAmount += c.amount;
      if (categoryBreakdown[c.category] !== undefined) {
        categoryBreakdown[c.category] += c.amount;
      }

      const effectiveAmt = c.approved_amount !== undefined && c.approved_amount !== null ? Number(c.approved_amount) : Number(c.amount);

      if (c.status === 'pending') {
        pendingCount++;
        pendingAmount += c.amount;
      } else if (c.status === 'acc_approved') {
        accApprovedCount++;
        accApprovedAmount += effectiveAmt;
      } else if (c.status === 'approved') {
        approvedCount++;
        approvedAmount += effectiveAmt;
      } else if (c.status === 'disbursed') {
        disbursedCount++;
        disbursedAmount += effectiveAmt;
      } else if (c.status === 'rejected') {
        rejectedCount++;
      }
    });

    res.json({
      success: true,
      month: currentMonth,
      stats: {
        total_claims: claims.length,
        total_amount: totalAmount,
        pending_count: pendingCount,
        pending_amount: pendingAmount,
        acc_approved_count: accApprovedCount,
        acc_approved_amount: accApprovedAmount,
        approved_count: approvedCount,
        approved_amount: approvedAmount,
        disbursed_count: disbursedCount,
        disbursed_amount: disbursedAmount,
        rejected_count: rejectedCount,
        category_breakdown: categoryBreakdown
      }
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ success: false, message: '計算統計數據失敗' });
  }
});

// 3. 送出零用金申請
router.post('/', async (req, res) => {
  try {
    const sanitizedData = securityService.sanitizeClaimInput(req.body);
    const claimNo = db.generateClaimNo(sanitizedData.expense_date);

    // 若有上傳發票/憑證相片，自動串接上傳至 Google Drive 雲端資料夾 (或本地儲存備份)
    let rawPhotoBase64 = null;
    if (sanitizedData.receipt_url && sanitizedData.receipt_url.startsWith('data:image')) {
      rawPhotoBase64 = sanitizedData.receipt_url;
      try {
        sanitizedData.receipt_url = await googleDriveService.uploadReceipt(claimNo, sanitizedData.receipt_url);
      } catch (uploadErr) {
        console.warn('Receipt upload notice:', uploadErr.message);
      }
    }

    const newClaim = {
      id: `clm_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
      claim_no: claimNo,
      user_id: req.user.id,
      user_name: req.user.name,
      department: req.user.department || '未分配',
      ...sanitizedData,
      status: 'pending',
      rejection_reason: '',
      audit_trail: [
        {
          action: '送出申請',
          by: req.user.name,
          by_role: req.user.role,
          at: new Date().toISOString(),
          note: '同仁提交零用金申請'
        }
      ],
      sheet_synced: false,
      sheet_synced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    db.createClaim(newClaim);

    // 非同步同步至 Google Sheets (背景處理，不阻塞前端回應)
    googleSheetService.appendClaim(newClaim, rawPhotoBase64).catch(err => {
      console.warn('Background Google Sheet sync notice:', err.message);
    });

    res.status(201).json({
      success: true,
      message: `零用金申請已成功送出！單號：${claimNo}`,
      claim: newClaim
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || '送出申請失敗'
    });
  }
});

// 4. 修改申請單內容 (一般員工僅能修改本人待審核之單據)
router.put('/:id', async (req, res) => {
  try {
    const claim = db.findClaimById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, message: '找不到該筆申請單' });
    }

    if (req.user.role === 'employee') {
      if (claim.user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: '權限不足：您只能修改自己的申請單' });
      }
      if (claim.status !== 'pending' && claim.status !== 'rejected') {
        return res.status(400).json({ success: false, message: '此申請單已進入審核或已核准，無法再進行修改' });
      }
    }

    const sanitizedData = securityService.sanitizeClaimInput(req.body);

    // 若有更新照片
    if (sanitizedData.receipt_url && sanitizedData.receipt_url.startsWith('data:image')) {
      try {
        sanitizedData.receipt_url = await googleDriveService.uploadReceipt(claim.claim_no, sanitizedData.receipt_url);
      } catch (uploadErr) {
        console.warn('Receipt update upload notice:', uploadErr.message);
      }
    }

    const trail = claim.audit_trail || [];
    trail.push({
      action: '修改內容',
      by: req.user.name,
      by_role: req.user.role,
      at: new Date().toISOString(),
      note: '更新項目內容與金額'
    });

    const updated = db.updateClaim(claim.id, {
      ...sanitizedData,
      status: claim.status === 'rejected' ? 'pending' : claim.status, // 被退件修改後重新進入待審核
      audit_trail: trail,
      sheet_synced: false
    });

    res.json({
      success: true,
      message: '申請單已成功更新',
      claim: updated
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});


// 5. 審核 / 撥款 / 退回狀態變更與批准金額調整 (落實會計初審 + 超級使用者終審二階段審核)
router.patch('/:id/status', requireRole('accountant', 'admin'), (req, res) => {
  try {
    const { status, reason, note, approved_amount } = req.body;
    const validStatuses = ['acc_approved', 'approved', 'disbursed', 'rejected', 'pending'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: '無效的審核狀態' });
    }

    const claim = db.findClaimById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, message: '找不到該筆申請單' });
    }

    // 二階段審核權限嚴格校驗：
    // 規則 1: 終審核准 (approved) 僅限超級管理者 (admin) 執行；會計人員僅能執行會計初審 (acc_approved)
    if (status === 'approved' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '權限不足：會計初審完成後，必須由超級使用者(主管)執行最終審核核准'
      });
    }

    // 規則 2: 會計撥款 (disbursed) 必須在超級使用者終審核准 (approved) 後方可執行
    if (status === 'disbursed' && req.user.role === 'accountant' && claim.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: '該單據尚未完成超級使用者(主管)終審核准，不得直接撥款'
      });
    }

    const actionText = {
      acc_approved: '會計初審通過 (送交主管終審)',
      approved: '主管終審核准',
      disbursed: '完成撥款核銷',
      rejected: '審核退回',
      pending: '重設為待審核'
    }[status];

    // 處理批准金額 (approved_amount)
    let finalApprovedAmount = claim.approved_amount !== undefined ? claim.approved_amount : null;
    let oldApprovedAmt = claim.approved_amount !== undefined && claim.approved_amount !== null
      ? Number(claim.approved_amount)
      : Number(claim.amount);
    let amountSpecified = false;

    if (approved_amount !== undefined && approved_amount !== null && approved_amount !== '') {
      const parsed = Number(approved_amount);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ success: false, message: '批准金額必須為合法的正數或 0' });
      }
      finalApprovedAmount = Math.round(parsed);
      amountSpecified = true;
    } else if ((status === 'acc_approved' || status === 'approved') && (claim.approved_amount === undefined || claim.approved_amount === null)) {
      // 初審或終審通過但未特別指定時，預設帶入原申報金額
      finalApprovedAmount = Number(claim.amount);
      amountSpecified = true;
    }

    // 判斷是否需要記錄金額變更至實體 Log 檔
    const shouldLog = (status === 'acc_approved' || status === 'approved' || status === 'disbursed') || (amountSpecified && finalApprovedAmount !== oldApprovedAmt);

    if (shouldLog) {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      auditLogService.logApprovalChange({
        claim,
        user: req.user,
        oldApprovedAmount: oldApprovedAmt,
        newApprovedAmount: finalApprovedAmount !== null ? finalApprovedAmount : claim.amount,
        action: actionText,
        reason: reason || note || '',
        ip: clientIp
      });
    }

    const trail = claim.audit_trail || [];
    const trailEntry = {
      action: actionText,
      by: req.user.name,
      by_role: req.user.role,
      at: new Date().toISOString(),
      note: reason || note || ''
    };

    if (finalApprovedAmount !== null) {
      trailEntry.approved_amount = finalApprovedAmount;
      trailEntry.claim_amount = claim.amount;
      trailEntry.diff = finalApprovedAmount - claim.amount;
    }

    trail.push(trailEntry);

    const updatePayload = {
      status,
      rejection_reason: status === 'rejected' ? (reason || '未說明原因') : '',
      audit_trail: trail,
      sheet_synced: false
    };

    if (finalApprovedAmount !== null) {
      updatePayload.approved_amount = finalApprovedAmount;
    }

    const updated = db.updateClaim(claim.id, updatePayload);

    // 觸發 Google Sheets 背景同步更新
    googleSheetService.syncAllClaims().catch(e => {
      console.warn('Status sync notice:', e.message);
    });

    res.json({
      success: true,
      message: `單號 ${claim.claim_no} 已${actionText}${finalApprovedAmount !== null ? ` (批准金額: NT$ ${finalApprovedAmount.toLocaleString('en-US')})` : ''}`,
      claim: updated
    });
  } catch (err) {
    console.error('Update claim status error:', err);
    res.status(500).json({ success: false, message: '更新狀態失敗: ' + err.message });
  }
});

// 6. 刪除申請單
router.delete('/:id', (req, res) => {
  try {
    const claim = db.findClaimById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, message: '找不到該筆申請單' });
    }

    if (req.user.role === 'employee') {
      if (claim.user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: '只能刪除自己的申請單' });
      }
      if (claim.status !== 'pending' && claim.status !== 'rejected') {
        return res.status(400).json({ success: false, message: '已核准或撥款之單據無法刪除' });
      }
    }

    db.deleteClaim(claim.id);

    res.json({
      success: true,
      message: `申請單 ${claim.claim_no} 已成功刪除`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '刪除申請單失敗: ' + err.message });
  }
});

// 7. AI 智能發票/收據照片辨識 (支援一張照片辨識單張或多張發票)
router.post('/recognize-receipt', async (req, res) => {
  try {
    const { image_data, gemini_api_key } = req.body;
    if (!image_data) {
      return res.status(400).json({ success: false, message: '請提供發票照片資料 (Base64)' });
    }

    const result = await aiReceiptService.recognizeReceipts(image_data, gemini_api_key);
    res.json(result);
  } catch (err) {
    console.error('AI Receipt Recognition Error:', err);
    res.status(500).json({
      success: false,
      message: '辨識發票失敗: ' + (err.message || '未知錯誤')
    });
  }
});

// 8. 批次自動建立申請單 (由 AI 辨識結果一鍵生成，共用同一張發票照片)
router.post('/batch-create', async (req, res) => {
  try {
    const { claims, receipt_url } = req.body;
    if (!Array.isArray(claims) || claims.length === 0) {
      return res.status(400).json({ success: false, message: '請提供欲建立的申請單資料陣列' });
    }

    // 1. 若有上傳照片，統一儲存備份至本地 (或 Google Drive)
    let savedReceiptUrl = receipt_url || '';
    let rawPhotoBase64 = null;
    if (receipt_url && receipt_url.startsWith('data:image')) {
      rawPhotoBase64 = receipt_url;
      try {
        const batchClaimPrefix = db.generateClaimNo(new Date().toISOString().split('T')[0]);
        savedReceiptUrl = await googleDriveService.uploadReceipt(batchClaimPrefix, receipt_url);
      } catch (uploadErr) {
        console.warn('Batch receipt upload notice:', uploadErr.message);
      }
    }

    const createdClaims = [];

    // 2. 逐筆建立零用金申請單
    for (const c of claims) {
      const sanitized = securityService.sanitizeClaimInput({
        ...c,
        receipt_url: savedReceiptUrl
      });

      const claimNo = db.generateClaimNo(sanitized.expense_date);

      const newClaim = {
        id: `clm_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        claim_no: claimNo,
        user_id: req.user.id,
        user_name: req.user.name,
        department: req.user.department || '未分配',
        ...sanitized,
        status: 'pending',
        rejection_reason: '',
        audit_trail: [
          {
            action: 'AI自動辨識送審',
            by: req.user.name,
            by_role: req.user.role,
            at: new Date().toISOString(),
            note: '由發票照片多張自動辨識生成'
          }
        ],
        sheet_synced: false,
        sheet_synced_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      db.createClaim(newClaim);
      createdClaims.push(newClaim);

      // 背景同步至 Google Sheets
      googleSheetService.appendClaim(newClaim, rawPhotoBase64).catch(e => {
        console.warn('Background Google Sheet sync notice:', e.message);
      });
    }

    res.status(201).json({
      success: true,
      message: `🎉 成功由發票照片自動建立 ${createdClaims.length} 筆零用金申請單！`,
      count: createdClaims.length,
      claims: createdClaims
    });
  } catch (err) {
    console.error('Batch Create Claims Error:', err);
    res.status(400).json({ success: false, message: err.message || '批次建立申請單失敗' });
  }
});

module.exports = router;
