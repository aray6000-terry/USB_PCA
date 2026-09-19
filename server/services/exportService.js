const ExcelJS = require('exceljs');

const statusLabels = {
  pending: '待審核',
  approved: '已核准',
  disbursed: '已撥款核銷',
  rejected: '已退回'
};

const exportService = {
  // 產生格式化 Excel (.xlsx) 報表
  async generateExcel(claims, filterInfo = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '企業零用金申請系統';
    workbook.lastModifiedBy = '財務部會計處';
    workbook.created = new Date();

    // 1. 明細工作表
    const sheet = workbook.addWorksheet('零用金申請明細表', {
      views: [{ showGridLines: true }]
    });

    // 報表大標題
    const titleText = filterInfo.month
      ? `企業零用金支出核銷明細表 (${filterInfo.month} 月份)`
      : '企業零用金支出核銷明細總表';

    sheet.mergeCells('A1:M1');
    const titleRow = sheet.getCell('A1');
    titleRow.value = titleText;
    titleRow.font = { name: '微軟正黑體', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // Slate 800
    };
    titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 40;

    // 報表資訊列
    sheet.mergeCells('A2:M2');
    const subTitle = sheet.getCell('A2');
    const nowStr = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    subTitle.value = `匯出時間：${nowStr}  |  篩選條件：${filterInfo.category || '全部類別'} / ${filterInfo.status || '全部狀態'}  |  申請筆數：${claims.length} 筆`;
    subTitle.font = { name: '微軟正黑體', size: 10, color: { argb: 'FF64748B' } };
    subTitle.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(2).height = 24;

    // 表頭欄位定義
    const headers = [
      { header: '申請單號', key: 'claim_no', width: 18 },
      { header: '消費日期', key: 'expense_date', width: 14 },
      { header: '申請同仁', key: 'user_name', width: 18 },
      { header: '所屬部門', key: 'department', width: 15 },
      { header: '費用類別', key: 'category', width: 16 },
      { header: '申請項目說明', key: 'item_name', width: 32 },
      { header: '申報金額 (NT$)', key: 'amount', width: 16 },
      { header: '核准金額 (NT$)', key: 'approved_amount', width: 16 },
      { header: '發票/收據號碼', key: 'receipt_no', width: 18 },
      { header: '備註說明', key: 'notes', width: 28 },
      { header: '審核狀態', key: 'status_label', width: 14 },
      { header: '申請時間', key: 'created_at_fmt', width: 20 },
      { header: '發票憑證照片 (實體圖檔)', key: 'receipt_photo', width: 32 }
    ];

    const headerRow = sheet.getRow(3);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h.header;
      cell.font = { name: '微軟正黑體', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' } // Royal Blue 600
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
      sheet.getColumn(idx + 1).width = h.width;
    });
    headerRow.height = 28;

    const fs = require('fs');
    const path = require('path');
    const googleDriveService = require('./googleDriveService');

    // 寫入資料列
    let currentRowIdx = 4;
    claims.forEach(c => {
      const row = sheet.getRow(currentRowIdx);
      const approvedAmt = c.approved_amount !== undefined && c.approved_amount !== null ? c.approved_amount : c.amount;

      row.values = [
        c.claim_no,
        c.expense_date,
        c.user_name,
        c.department,
        c.category,
        c.item_name,
        c.amount,
        approvedAmt,
        c.receipt_no || '-',
        c.notes || '-',
        statusLabels[c.status] || c.status,
        new Date(c.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        ''
      ];

      // 嘗試嵌入本地憑證圖片縮圖 (實體圖檔)
      let hasImageThumbnail = false;
      const localFilePath = googleDriveService.getLocalFilePathFromUrl(c.receipt_url, c.claim_no);
      if (localFilePath && fs.existsSync(localFilePath)) {
        try {
          let ext = path.extname(localFilePath).toLowerCase().replace('.', '');
          if (ext === 'jpg') ext = 'jpeg';
          if (!['png', 'jpeg', 'gif'].includes(ext)) ext = 'png';

          const imageId = workbook.addImage({
            filename: localFilePath,
            extension: ext
          });
          sheet.addImage(imageId, {
            tl: { col: 12.08, row: currentRowIdx - 1 + 0.08 },
            ext: { width: 145, height: 68 },
            editAs: 'oneCell'
          });
          hasImageThumbnail = true;
        } catch (imgErr) {
          console.warn('Embed image into Excel notice:', imgErr.message);
        }
      } else if (c.receipt_url && c.receipt_url.startsWith('data:image')) {
        try {
          const matches = c.receipt_url.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
          if (matches) {
            let ext = matches[1].toLowerCase();
            if (ext === 'jpg') ext = 'jpeg';
            if (!['png', 'jpeg', 'gif'].includes(ext)) ext = 'png';
            const imgBuffer = Buffer.from(matches[2], 'base64');
            const imageId = workbook.addImage({
              buffer: imgBuffer,
              extension: ext
            });
            sheet.addImage(imageId, {
              tl: { col: 12.08, row: currentRowIdx - 1 + 0.08 },
              ext: { width: 145, height: 68 },
              editAs: 'oneCell'
            });
            hasImageThumbnail = true;
          }
        } catch (b64Err) {
          console.warn('Embed base64 image into Excel notice:', b64Err.message);
        }
      }

      // 若有網址，設定為可點擊超連結
      const photoCell = row.getCell(13);
      if (c.receipt_url && c.receipt_url.startsWith('http')) {
        photoCell.value = { text: '🔗 點擊開啟照片 (Drive)', hyperlink: c.receipt_url };
        photoCell.font = { name: '微軟正黑體', size: 9, color: { argb: 'FF2563EB' }, underline: true };
        photoCell.alignment = { vertical: 'bottom', horizontal: 'center' };
      } else if (!hasImageThumbnail) {
        photoCell.value = c.receipt_url ? '已附發票憑證' : '-';
        photoCell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        photoCell.value = '';
        photoCell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      // 樣式微調
      for (let col = 1; col <= 13; col++) {
        const cell = row.getCell(col);
        if (col !== 13 || !c.receipt_url || !c.receipt_url.startsWith('http')) {
          cell.font = { name: '微軟正黑體', size: 10 };
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        // 金額靠右並格式化
        if (col === 7 || col === 8) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '"NT$"#,##0';
          if (col === 8 && approvedAmt !== c.amount) {
            cell.font = { name: '微軟正黑體', size: 10, bold: true, color: { argb: 'FF059669' } };
          }
        } else if (col === 1 || col === 2 || col === 9 || col === 11) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if (col !== 13) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      }

      if (currentRowIdx % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }
      row.height = hasImageThumbnail ? 78 : 28;
      currentRowIdx++;
    });

    // 總計列
    const totalRow = sheet.getRow(currentRowIdx);
    sheet.mergeCells(`A${currentRowIdx}:F${currentRowIdx}`);
    const totalLabel = sheet.getCell(`A${currentRowIdx}`);
    totalLabel.value = '總計金額 (Total)';
    totalLabel.font = { name: '微軟正黑體', size: 11, bold: true };
    totalLabel.alignment = { vertical: 'middle', horizontal: 'center' };

    const totalAmountCell = sheet.getCell(`G${currentRowIdx}`);
    totalAmountCell.value = {
      formula: `SUM(G4:G${currentRowIdx - 1})`
    };
    totalAmountCell.font = { name: '微軟正黑體', size: 11, bold: true, color: { argb: 'FFDC2626' } };
    totalAmountCell.numFmt = '"NT$"#,##0';
    totalAmountCell.alignment = { vertical: 'middle', horizontal: 'right' };

    for (let c = 1; c <= 12; c++) {
      const cell = totalRow.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } }
      };
    }
    totalRow.height = 28;


    // 2. 統計彙總工作表 (類別分析)
    const summarySheet = workbook.addWorksheet('費用類別統計彙總');
    summarySheet.views = [{ showGridLines: true }];

    summarySheet.mergeCells('A1:D1');
    const sTitle = summarySheet.getCell('A1');
    sTitle.value = '零用金費用類別統計彙總表';
    sTitle.font = { name: '微軟正黑體', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    sTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    sTitle.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(1).height = 36;

    const sHeaders = ['費用類別', '申請筆數', '總金額 (NT$)', '佔比 (%)'];
    const sHeaderRow = summarySheet.getRow(2);
    sHeaders.forEach((h, idx) => {
      const cell = sHeaderRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: '微軟正黑體', bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    summarySheet.columns = [
      { width: 22 },
      { width: 16 },
      { width: 20 },
      { width: 16 }
    ];

    // 計算各類別
    const categoryMap = {};
    let grandTotal = 0;
    claims.forEach(c => {
      if (!categoryMap[c.category]) {
        categoryMap[c.category] = { count: 0, sum: 0 };
      }
      categoryMap[c.category].count += 1;
      categoryMap[c.category].sum += c.amount;
      grandTotal += c.amount;
    });

    let sRowIdx = 3;
    Object.keys(categoryMap).forEach(cat => {
      const row = summarySheet.getRow(sRowIdx);
      const data = categoryMap[cat];
      const percent = grandTotal > 0 ? (data.sum / grandTotal) * 100 : 0;
      row.values = [
        cat,
        data.count,
        data.sum,
        `${percent.toFixed(1)}%`
      ];
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(3).numFmt = '"NT$"#,##0';
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
      sRowIdx++;
    });

    return await workbook.xlsx.writeBuffer();
  },

  // 產生 UTF-8 BOM CSV (相容中文 Excel 開啟)
  generateCsv(claims) {
    const headers = [
      '申請單號',
      '消費日期',
      '申請同仁',
      '所屬部門',
      '費用類別',
      '申請項目說明',
      '申報金額',
      '核准金額',
      '發票號碼',
      '備註說明',
      '審核狀態',
      '申請時間',
      '憑證照片網址'
    ];

    const escapeCsv = val => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = [headers.map(escapeCsv).join(',')];

    claims.forEach(c => {
      const approvedAmt = c.approved_amount !== undefined && c.approved_amount !== null ? c.approved_amount : c.amount;
      const row = [
        c.claim_no,
        c.expense_date,
        c.user_name,
        c.department,
        c.category,
        c.item_name,
        c.amount,
        approvedAmt,
        c.receipt_no || '',
        c.notes || '',
        statusLabels[c.status] || c.status,
        new Date(c.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        c.receipt_url || ''
      ];
      rows.push(row.map(escapeCsv).join(','));
    });

    // 加入 UTF-8 BOM (\uFEFF)
    return '\uFEFF' + rows.join('\r\n');
  }
};


module.exports = exportService;
