const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const exportService = require('../services/exportService');

router.use(authenticateToken);

// 匯出 Excel 格式報表 (.xlsx)
router.get('/excel', async (req, res) => {
  try {
    const { month, category, status, keyword, user_id } = req.query;
    const filter = { month, category, status, keyword };

    // RBAC: 一般員工僅能匯出自身資料
    if (req.user.role === 'employee') {
      filter.user_id = req.user.id;
    } else if (user_id) {
      filter.user_id = user_id;
    }

    const claims = db.listClaims(filter);

    const buffer = await exportService.generateExcel(claims, {
      month: month || '全期',
      category: category && category !== 'all' ? category : '全部類別',
      status: status && status !== 'all' ? status : '全部狀態'
    });

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = encodeURIComponent(`零用金明細表_${month || '全部'}_${timestamp}.xlsx`);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
    res.send(buffer);
  } catch (err) {
    console.error('Export Excel error:', err);
    res.status(500).json({ success: false, message: '匯出 Excel 報表失敗' });
  }
});

// 匯出 CSV 格式報表 (.csv)
router.get('/csv', (req, res) => {
  try {
    const { month, category, status, keyword, user_id } = req.query;
    const filter = { month, category, status, keyword };

    if (req.user.role === 'employee') {
      filter.user_id = req.user.id;
    } else if (user_id) {
      filter.user_id = user_id;
    }

    const claims = db.listClaims(filter);
    const csvContent = exportService.generateCsv(claims);

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = encodeURIComponent(`零用金明細_${month || '全部'}_${timestamp}.csv`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
    res.send(csvContent);
  } catch (err) {
    console.error('Export CSV error:', err);
    res.status(500).json({ success: false, message: '匯出 CSV 報表失敗' });
  }
});

module.exports = router;
