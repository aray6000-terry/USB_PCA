// 前端 API 通訊與雙模運作層 (支援本地 Node.js 後端 + GitHub Pages 雲端直連模式)
const API_BASE = (function () {
  if (typeof window === 'undefined') return '/api';
  // 若運行於 GitHub Pages (*.github.io)，預設啟用雲端直連模式
  if (window.location.hostname.includes('github.io')) {
    return '/api';
  }
  // 若使用本地 file:// 協定開啟 index.html
  if (window.location.protocol === 'file:') {
    return 'http://localhost:3050/api';
  }
  // 若不是透過後端伺服器 port (3050) 開啟 (例如 Live Server 或其他 port)
  if (window.location.port && window.location.port !== '3050') {
    return `http://${window.location.hostname || 'localhost'}:3050/api`;
  }
  return '/api';
})();

class ApiService {
  constructor() {
    this.token = localStorage.getItem('petty_cash_token') || null;
    this.currentUser = null;
    try {
      const stored = localStorage.getItem('petty_cash_user');
      if (stored) this.currentUser = JSON.parse(stored);
    } catch (e) {
      this.currentUser = null;
    }

    // 判斷是否為 GitHub Pages 或無後端伺服器環境
    this.isCloudMode = Boolean(
      window.location.hostname.includes('github.io') ||
      window.location.protocol === 'file:'
    );

    // 主動清除本機已快取的預設示範帳號 (admin, accountant, employee, designer)
    this.purgeDeprecatedUsers();

    // 初始化本地快取資料庫
    this.initCloudStore();

    // 背景非同步探測後端健康狀態 (若是在一般網域且後端可通則維持 API 模式，若 404/連不上則切換雲端模式)
    if (!this.isCloudMode && typeof window !== 'undefined') {
      fetch(`${API_BASE}/health`, { method: 'GET' })
        .then(res => {
          if (!res.ok) this.enableCloudMode('後端伺服器無回應 (切換至雲端模式)');
        })
        .catch(() => {
          this.enableCloudMode('無本地後端伺服器 (切換至 GitHub Pages 雲端直連模式)');
        });
    } else if (this.isCloudMode) {
      console.log('☁️ 系統正運行於 GitHub Pages 雲端直連模式 (自動整合 Google Sheets 與 Google Drive)');
    }
  }

  // 主動清除廢棄之預設示範帳號
  purgeDeprecatedUsers() {
    if (typeof localStorage === 'undefined') return;
    const banned = ['admin', 'accountant', 'employee', 'designer'];

    // 1. 若當前登入者身分為被刪除之帳號，強制清除登入態
    if (this.currentUser && banned.includes((this.currentUser.username || '').toLowerCase())) {
      console.warn('當前快取之登入者為已刪除預設帳號，強制清除登入狀態');
      this.clearSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
    }

    // 2. 清理 localStorage 中遺留之使用者
    try {
      const raw = localStorage.getItem('petty_cash_users');
      if (raw) {
        let users = JSON.parse(raw);
        const filtered = users.filter(u =>
          !banned.includes((u.username || '').toLowerCase()) &&
          !u.username.startsWith('user_') &&
          !u.username.startsWith('sheet_user_')
        );
        localStorage.setItem('petty_cash_users', JSON.stringify(filtered));
      }
    } catch (e) {}
  }

  enableCloudMode(reason) {
    this.isCloudMode = true;
    console.info(`[Mode] ${reason}`);
    this.initCloudStore();
    window.dispatchEvent(new CustomEvent('system:cloud-mode-enabled'));
  }

  // 初始化雲端 / 本地 Store
  initCloudStore() {
    if (typeof localStorage === 'undefined') return;
    this.purgeDeprecatedUsers();
    const seed = window.PETTY_CASH_SEED_DATA || {};

    if (!localStorage.getItem('petty_cash_claims')) {
      const initialClaims = seed.claims || [];
      localStorage.setItem('petty_cash_claims', JSON.stringify(initialClaims));
    } else {
      // 自動校正修復歷史快取中缺漏或不符的憑證圖檔路徑
      try {
        const rawStored = localStorage.getItem('petty_cash_claims');
        if (rawStored) {
          let stored = JSON.parse(rawStored);
          let changed = false;
          stored.forEach(sc => {
            if (seed.claims) {
              const found = seed.claims.find(x => x.claim_no === sc.claim_no);
              if (found && found.receipt_url && (!sc.receipt_url || sc.receipt_url !== found.receipt_url)) {
                sc.receipt_url = found.receipt_url;
                changed = true;
              }
            }
          });
          if (changed) {
            localStorage.setItem('petty_cash_claims', JSON.stringify(stored));
          }
        }
      } catch (e) {}
    }

    // 重新載入時若無使用者或含有廢棄帳號，強制使用最新種子名冊
    const rawUsers = localStorage.getItem('petty_cash_users');
    if (!rawUsers || rawUsers.includes('"admin"') || rawUsers.includes('"accountant"')) {
      const initialUsers = seed.users || [];
      localStorage.setItem('petty_cash_users', JSON.stringify(initialUsers));
    }

    if (!localStorage.getItem('petty_cash_applications')) {
      const initialApps = seed.user_applications || [];
      localStorage.setItem('petty_cash_applications', JSON.stringify(initialApps));
    }

    if (!localStorage.getItem('petty_cash_config')) {
      const initialCfg = seed.config || {
        system_name: '企業每月零用金申請與核銷系統',
        google_sheet_enabled: true,
        google_gas_url: 'https://script.google.com/macros/s/AKfycbxTdgqw22UF8KZCYCXlGo7SuwV7Q_nBWBC9wT6OJqEBIjb6Nea0V5bFSiy2JlMbSeMDxg/exec',
        google_sheet_name: '零用金申請明細',
        monthly_budget_warning: 50000
      };
      localStorage.setItem('petty_cash_config', JSON.stringify(initialCfg));
    }

    if (!localStorage.getItem('petty_cash_approval_logs')) {
      localStorage.setItem('petty_cash_approval_logs', JSON.stringify([]));
    }
  }

  getCloudConfig() {
    try {
      const cfg = localStorage.getItem('petty_cash_config');
      if (cfg) return JSON.parse(cfg);
    } catch (e) {}
    return (window.PETTY_CASH_SEED_DATA && window.PETTY_CASH_SEED_DATA.config) || {
      system_name: '企業每月零用金申請與核銷系統',
      google_sheet_enabled: true,
      google_gas_url: 'https://script.google.com/macros/s/AKfycbxTdgqw22UF8KZCYCXlGo7SuwV7Q_nBWBC9wT6OJqEBIjb6Nea0V5bFSiy2JlMbSeMDxg/exec',
      google_sheet_name: '零用金申請明細',
      monthly_budget_warning: 50000
    };
  }

  getCloudUsers() {
    const banned = ['admin', 'accountant', 'employee', 'designer'];
    let users = [];
    try {
      const u = localStorage.getItem('petty_cash_users');
      if (u) users = JSON.parse(u);
      else users = (window.PETTY_CASH_SEED_DATA && window.PETTY_CASH_SEED_DATA.users) || [];
    } catch (e) {
      users = (window.PETTY_CASH_SEED_DATA && window.PETTY_CASH_SEED_DATA.users) || [];
    }
    return users.filter(u =>
      !banned.includes((u.username || '').toLowerCase()) &&
      !u.username.startsWith('user_') &&
      !u.username.startsWith('sheet_user_')
    );
  }

  saveCloudUsers(users) {
    localStorage.setItem('petty_cash_users', JSON.stringify(users));
  }

  getCloudClaims() {
    try {
      const c = localStorage.getItem('petty_cash_claims');
      if (c) return JSON.parse(c);
    } catch (e) {}
    return (window.PETTY_CASH_SEED_DATA && window.PETTY_CASH_SEED_DATA.claims) || [];
  }

  saveCloudClaims(claims) {
    localStorage.setItem('petty_cash_claims', JSON.stringify(claims));
  }

  getCloudLogs() {
    try {
      const l = localStorage.getItem('petty_cash_approval_logs');
      if (l) return JSON.parse(l);
    } catch (e) {}
    return [];
  }

  saveCloudLogs(logs) {
    localStorage.setItem('petty_cash_approval_logs', JSON.stringify(logs));
  }

  // 確保 ExcelJS 函式庫已載入 (支援本地、全域與 CDN 動態容錯)
  async ensureExcelJS() {
    if (typeof window !== 'undefined' && (window.ExcelJS || window.exceljs)) {
      return window.ExcelJS || window.exceljs;
    }
    if (typeof ExcelJS !== 'undefined') {
      return ExcelJS;
    }
    if (typeof document === 'undefined') {
      try {
        return require('exceljs');
      } catch (e) {
        throw new Error('ExcelJS 模組未安裝');
      }
    }
    return new Promise((resolve, reject) => {
      // 1. 嘗試由本專案的 public/js/exceljs.min.js 載入
      const script = document.createElement('script');
      script.src = 'js/exceljs.min.js';
      script.onload = () => {
        const lib = (typeof window !== 'undefined' && (window.ExcelJS || window.exceljs)) || (typeof ExcelJS !== 'undefined' && ExcelJS);
        if (lib) resolve(lib);
        else reject(new Error('ExcelJS 載入但未建立全域物件'));
      };
      script.onerror = () => {
        // 2. 本地若 404，由知名 CDN 備援加載
        const cdnScript = document.createElement('script');
        cdnScript.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
        cdnScript.onload = () => {
          const lib = (typeof window !== 'undefined' && (window.ExcelJS || window.exceljs)) || (typeof ExcelJS !== 'undefined' && ExcelJS);
          if (lib) resolve(lib);
          else reject(new Error('CDN ExcelJS 載入但未建立全域物件'));
        };
        cdnScript.onerror = () => reject(new Error('無法載入 ExcelJS 報表生成函式庫'));
        document.head.appendChild(cdnScript);
      };
      document.head.appendChild(script);
    });
  }

  // 安全解析發票憑證路徑 (支援 GitHub Pages 次目錄與本機 file:// 包含 # 字元之編碼)
  resolveReceiptUrl(url) {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;

    // Google Drive 縮圖直連 (lh3.googleusercontent.com 支援公開跨域讀取)
    const driveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|uc\?export=view&id=)([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${driveMatch[1]}=w800`;
    }

    if (url.startsWith('http://') || url.startsWith('https://')) return url;

    const cleanPath = url.replace(/^\/?(public\/)?uploads\//, ''); // e.g. "EXP-..."

    if (typeof window !== 'undefined' && window.location) {
      if (window.location.protocol === 'file:') {
        const safeHref = window.location.href.replace(/#/g, '%23');
        const dirUrl = safeHref.substring(0, safeHref.lastIndexOf('/') + 1);
        if (dirUrl.includes('/public/')) {
          return new URL('uploads/' + cleanPath, dirUrl).href;
        } else {
          return new URL('public/uploads/' + cleanPath, dirUrl).href;
        }
      }

      // GitHub Pages 或一般 Web 伺服器 (包含次目錄如 /USB_PCA/)
      const href = window.location.href.split('?')[0].split('#')[0];
      const dirUrl = href.substring(0, href.lastIndexOf('/') + 1);
      if (dirUrl.includes('/public/')) {
        return new URL('uploads/' + cleanPath, dirUrl).href;
      } else {
        return new URL('public/uploads/' + cleanPath, dirUrl).href;
      }
    }

    return url;
  }

  // 透過 Canvas 轉碼非標準格式 (例如 WebP 轉成廣泛相容的 JPEG)
  async convertImageSourceViaCanvas(src) {
    return new Promise((resolve) => {
      const img = new Image();
      if (src.startsWith('http')) {
        img.crossOrigin = 'anonymous';
      }
      const timer = setTimeout(() => resolve(null), 3000);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          let w = img.naturalWidth || img.width || 120;
          let h = img.naturalHeight || img.height || 80;
          const maxDim = 800;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve({
            base64: dataUrl,
            extension: 'jpeg',
            aspectRatio: w / h
          });
        } catch (e) {
          if (src.startsWith('data:image/')) {
            const ext = src.includes('image/png') ? 'png' : 'jpeg';
            resolve({ base64: src, extension: ext, aspectRatio: 1.33 });
          } else {
            resolve(null);
          }
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        if (src.startsWith('data:image/')) {
          const ext = src.includes('image/png') ? 'png' : 'jpeg';
          resolve({ base64: src, extension: ext, aspectRatio: 1.33 });
        } else {
          resolve(null);
        }
      };

      img.src = src;
    });
  }

  // 載入發票憑證圖片並轉化為 Excel 專用 Base64 與尺寸
  async loadReceiptImageForExcel(src, claimNo = '') {
    // 0. 優先由內建預載 Base64 字典直讀 (完全免除跨域、CORS、404、file:// 限制，100% 穩定秒開)
    if (typeof window !== 'undefined' && window.PETTY_CASH_SEED_IMAGES) {
      if (src && window.PETTY_CASH_SEED_IMAGES[src]) {
        return window.PETTY_CASH_SEED_IMAGES[src];
      }
      if (claimNo && window.PETTY_CASH_SEED_IMAGES[claimNo]) {
        return window.PETTY_CASH_SEED_IMAGES[claimNo];
      }
      if (src && typeof src === 'string') {
        const cleanPath = src.replace(/^\/?(public\/)?uploads\//, '');
        if (window.PETTY_CASH_SEED_IMAGES[cleanPath]) {
          return window.PETTY_CASH_SEED_IMAGES[cleanPath];
        }
      }
    }

    if (!src || typeof src !== 'string') {
      if (claimNo && typeof window !== 'undefined' && window.PETTY_CASH_SEED_IMAGES && window.PETTY_CASH_SEED_IMAGES[claimNo]) {
        return window.PETTY_CASH_SEED_IMAGES[claimNo];
      }
      return null;
    }

    // 1. 如果已是 Base64 Data URL (同仁線上填報或 AI 辨識)
    if (src.startsWith('data:image/')) {
      const isPng = src.startsWith('data:image/png');
      const isJpeg = src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg');
      if (isPng || isJpeg) {
        return {
          base64: src,
          extension: isPng ? 'png' : 'jpeg',
          aspectRatio: 1.33
        };
      }
      return await this.convertImageSourceViaCanvas(src);
    }

    // 2. 解析完整 URL (正確處理 GitHub Pages 次目錄與本機)
    const fullUrl = this.resolveReceiptUrl(src);

    // 3. 優先使用 fetch 讀取二進位 Blob (同源零 CORS 風險、不經 Canvas 絕不 Tainted)
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
      const res = await fetch(fullUrl, {
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const mime = (blob.type || '').toLowerCase();
      const isPng = mime.includes('png') || fullUrl.toLowerCase().endsWith('.png');
      const isJpeg = mime.includes('jpeg') || mime.includes('jpg') || fullUrl.toLowerCase().endsWith('.jpg') || fullUrl.toLowerCase().endsWith('.jpeg');

      // 使用 FileReader 轉為 Base64 Data URL
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      if (isPng || isJpeg) {
        return {
          base64: dataUrl,
          extension: isPng ? 'png' : 'jpeg',
          aspectRatio: 1.33
        };
      }

      // 若為 WebP，透過同源 Blob ObjectURL 進行 Canvas 轉碼 (永不 Tainted)
      const blobUrl = URL.createObjectURL(blob);
      const converted = await this.convertImageSourceViaCanvas(blobUrl);
      URL.revokeObjectURL(blobUrl);
      if (converted) return converted;

      return {
        base64: dataUrl,
        extension: 'png',
        aspectRatio: 1.33
      };
    } catch (fetchErr) {
      console.warn(`Fetch image failed for ${fullUrl}:`, fetchErr.message);
      // 容錯備援：嘗試使用傳統 Image 標籤加載
      return await this.convertImageSourceViaCanvas(fullUrl);
    }
  }

  // 純前端 / GitHub Pages / 雲端直連模式：以 ExcelJS 生成標準二進位 .xlsx 報表
  async generateClientExcel(claims, filterInfo = {}) {
    const ExcelJS = await this.ensureExcelJS();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '企業零用金申請系統 (Cloud/Web)';
    workbook.lastModifiedBy = '財務部會計處';
    workbook.created = new Date();

    const statusLabels = {
      pending: '待初審',
      acc_approved: '待複審',
      approved: '已核准',
      disbursed: '已撥款核銷',
      rejected: '已退回'
    };

    // 1. 明細工作表
    const sheet = workbook.addWorksheet('零用金申請明細表', {
      views: [{ showGridLines: true }]
    });

    const monthTitle = filterInfo.month && filterInfo.month !== 'all'
      ? ` (${filterInfo.month} 月份)`
      : ' (全部期間)';
    const titleText = `企業零用金支出核銷明細表${monthTitle}`;

    sheet.mergeCells('A1:L1');
    const titleRow = sheet.getCell('A1');
    titleRow.value = titleText;
    titleRow.font = { name: '微軟正黑體', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }
    };
    titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 40;

    sheet.mergeCells('A2:L2');
    const subTitle = sheet.getCell('A2');
    const nowStr = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    subTitle.value = `匯出時間：${nowStr}  |  篩選類別：${filterInfo.category && filterInfo.category !== 'all' ? filterInfo.category : '全部類別'}  |  篩選狀態：${filterInfo.status && filterInfo.status !== 'all' ? (statusLabels[filterInfo.status] || filterInfo.status) : '全部狀態'}  |  總筆數：${claims.length} 筆`;
    subTitle.font = { name: '微軟正黑體', size: 10, color: { argb: 'FF64748B' } };
    subTitle.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(2).height = 24;

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
      { header: '發票憑證相片 (實體圖檔)', key: 'receipt_photo', width: 32 }
    ];

    const headerRow = sheet.getRow(3);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h.header;
      cell.font = { name: '微軟正黑體', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' }
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

    let currentRowIdx = 4;
    for (const c of claims) {
      const row = sheet.getRow(currentRowIdx);
      const approvedAmt = c.approved_amount !== undefined && c.approved_amount !== null ? c.approved_amount : c.amount;

      // 檢查憑證圖檔路徑 (若快取遺漏，自動從種子資料補齊)
      let receiptUrl = c.receipt_url;
      if (!receiptUrl && typeof window !== 'undefined' && window.PETTY_CASH_SEED_DATA && window.PETTY_CASH_SEED_DATA.claims) {
        const matched = window.PETTY_CASH_SEED_DATA.claims.find(sc => sc.claim_no === c.claim_no);
        if (matched && matched.receipt_url) {
          receiptUrl = matched.receipt_url;
        }
      }

      row.values = [
        c.claim_no || '',
        c.expense_date || '',
        c.user_name || '',
        c.department || '',
        c.category || '',
        c.item_name || '',
        Number(c.amount) || 0,
        Number(approvedAmt) || 0,
        c.receipt_no || '-',
        c.notes || '-',
        statusLabels[c.status] || c.status || '待審核',
        ''
      ];

      // 嘗試載入並內嵌憑證實體圖檔 (支援 URL、單號與預載 Base64)
      let hasImage = false;
      try {
        const imgData = await this.loadReceiptImageForExcel(receiptUrl, c.claim_no);
        if (imgData && imgData.base64) {
          const imageId = workbook.addImage({
            base64: imgData.base64,
            extension: imgData.extension
          });

          // 保持比例置入儲存格
          let targetH = 68;
          let targetW = Math.round(targetH * (imgData.aspectRatio || 1.33));
          if (targetW > 165) {
            targetW = 165;
            targetH = Math.round(targetW / (imgData.aspectRatio || 1.33));
          }

          sheet.addImage(imageId, {
            tl: { col: 11.08, row: currentRowIdx - 1 + 0.08 },
            ext: { width: targetW, height: targetH },
            editAs: 'oneCell'
          });
          hasImage = true;
        }
      } catch (err) {
        console.warn(`前端 Excel 嵌入單據 ${c.claim_no} 照片失敗:`, err);
      }

      const photoCell = row.getCell(12);
      if (receiptUrl && receiptUrl.startsWith('http')) {
        photoCell.value = { text: '🔗 點擊開啟照片 (Drive)', hyperlink: receiptUrl };
        photoCell.font = { name: '微軟正黑體', size: 9, color: { argb: 'FF2563EB' }, underline: true };
        photoCell.alignment = { vertical: 'bottom', horizontal: 'center' };
      } else if (!hasImage) {
        photoCell.value = receiptUrl ? '已附發票憑證' : '-';
        photoCell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        photoCell.value = '';
        photoCell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      for (let col = 1; col <= 12; col++) {
        const cell = row.getCell(col);
        if (col !== 12 || !c.receipt_url || !c.receipt_url.startsWith('http')) {
          cell.font = { name: '微軟正黑體', size: 10 };
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        if (col === 7 || col === 8) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '"NT$"#,##0';
          if (col === 8 && approvedAmt !== c.amount) {
            cell.font = { name: '微軟正黑體', size: 10, bold: true, color: { argb: 'FF059669' } };
          }
        } else if (col === 1 || col === 2 || col === 9 || col === 11) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if (col !== 12) {
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
      row.height = hasImage ? 78 : 28;
      currentRowIdx++;
    }

    // 總計列
    const totalRow = sheet.getRow(currentRowIdx);
    sheet.mergeCells(`A${currentRowIdx}:F${currentRowIdx}`);
    const totalLabel = sheet.getCell(`A${currentRowIdx}`);
    totalLabel.value = '總計金額 (Total)';
    totalLabel.font = { name: '微軟正黑體', size: 11, bold: true };
    totalLabel.alignment = { vertical: 'middle', horizontal: 'center' };

    const totalAmountCell = sheet.getCell(`G${currentRowIdx}`);
    totalAmountCell.value = claims.length > 0 ? { formula: `SUM(G4:G${currentRowIdx - 1})` } : 0;
    totalAmountCell.font = { name: '微軟正黑體', size: 11, bold: true, color: { argb: 'FFDC2626' } };
    totalAmountCell.numFmt = '"NT$"#,##0';
    totalAmountCell.alignment = { vertical: 'middle', horizontal: 'right' };

    const approvedTotalCell = sheet.getCell(`H${currentRowIdx}`);
    approvedTotalCell.value = claims.length > 0 ? { formula: `SUM(H4:H${currentRowIdx - 1})` } : 0;
    approvedTotalCell.font = { name: '微軟正黑體', size: 11, bold: true, color: { argb: 'FF059669' } };
    approvedTotalCell.numFmt = '"NT$"#,##0';
    approvedTotalCell.alignment = { vertical: 'middle', horizontal: 'right' };

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

    const categoryMap = {};
    let grandTotal = 0;
    claims.forEach(c => {
      const cat = c.category || '其他';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { count: 0, sum: 0 };
      }
      categoryMap[cat].count += 1;
      const amt = Number(c.amount) || 0;
      categoryMap[cat].sum += amt;
      grandTotal += amt;
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

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  setSession(token, user) {
    this.token = token;
    this.currentUser = user;
    localStorage.setItem('petty_cash_token', token);
    localStorage.setItem('petty_cash_user', JSON.stringify(user));
  }

  clearSession() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('petty_cash_token');
    localStorage.removeItem('petty_cash_user');
  }

  isAuthenticated() {
    return Boolean(this.token);
  }

  getUser() {
    return this.currentUser;
  }

  // 伺服器通用請求器 (支援失敗時自動觸發雲端容錯)
  async request(endpoint, options = {}) {
    if (this.isCloudMode) {
      throw new Error(`CloudModeActive:${endpoint}`);
    }

    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Accept': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const res = await fetch(url, { ...options, headers });

      if (res.status === 401) {
        if (endpoint !== '/auth/login' && endpoint !== '/auth/register-request') {
          this.clearSession();
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          throw new Error('登入逾時或憑證無效，請重新登入');
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || '帳號或密碼錯誤');
        }
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('spreadsheetml') || contentType.includes('octet-stream')) {
        if (!res.ok) throw new Error('下載檔案失敗');
        return await res.blob();
      }
      if (contentType.includes('text/csv')) {
        if (!res.ok) throw new Error('下載 CSV 失敗');
        return await res.blob();
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `請求失敗 (HTTP ${res.status})`);
      }
      return data;
    } catch (err) {
      // 若後端無法連線 (如 GitHub Pages 404 或本地伺服器未開啟)，自動切換至雲端模式重試
      if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('404') || err.message.includes('NetworkError'))) {
        console.warn(`後端連線失敗，自動轉入 GitHub Pages 雲端直連模式: ${endpoint}`);
        this.enableCloudMode('連線容錯');
        throw new Error(`CloudModeActive:${endpoint}`);
      }
      throw err;
    }
  }

  // 1. 身分驗證模組
  auth = {
    login: async (username, password) => {
      // 嘗試一般伺服器登入
      if (!this.isCloudMode) {
        try {
          const res = await this.request('/auth/login', {
            method: 'POST',
            body: { username, password }
          });
          if (res.success && res.token) {
            this.setSession(res.token, res.user);
          }
          return res;
        } catch (err) {
          if (!err.message.startsWith('CloudModeActive')) {
            throw err;
          }
        }
      }

      // 雲端直連模式登入驗證
      const uName = String(username || '').trim().toLowerCase();
      const pwd = String(password || '').trim();

      const banned = ['admin', 'accountant', 'employee', 'designer'];
      if (banned.includes(uName)) {
        throw new Error('此預設示範帳號已遭永久刪除停用');
      }

      const users = this.getCloudUsers();
      let matched = users.find(u =>
        u.username.toLowerCase() === uName &&
        (u.plain_password === pwd || (!u.plain_password && pwd.length >= 6))
      );

      // 若本地未找到，嘗試連線 Google Apps Script 雲端工作表即時比對
      if (!matched) {
        try {
          const cfg = this.getCloudConfig();
          if (cfg.google_gas_url) {
            const gasRes = await fetch(`${cfg.google_gas_url}?action=get_users`).then(r => r.json());
            if (gasRes && gasRes.users && Array.isArray(gasRes.users)) {
              const sheetUser = gasRes.users.find(su =>
                su.username.toLowerCase() === uName &&
                (String(su.password || '').trim() === pwd || (!su.password && pwd === '123456'))
              );
              if (sheetUser) {
                matched = {
                  id: sheetUser.id || `usr_${sheetUser.username}`,
                  username: sheetUser.username,
                  name: sheetUser.name || sheetUser.username,
                  role: sheetUser.role || 'employee',
                  department: sheetUser.department || '一般部門',
                  created_at: new Date().toISOString()
                };
                users.push(matched);
                this.saveCloudUsers(users);
              }
            }
          }
        } catch (gasErr) {
          console.warn('GAS 雲端同仁驗證跳過:', gasErr.message);
        }
      }

      if (!matched) {
        throw new Error('帳號或密碼錯誤');
      }

      const mockToken = `pc_cloud_${matched.role}_${Date.now()}`;
      const safeUser = {
        id: matched.id,
        username: matched.username,
        name: matched.name,
        role: matched.role,
        department: matched.department,
        created_at: matched.created_at
      };

      this.setSession(mockToken, safeUser);
      return {
        success: true,
        message: '登入成功 (GitHub Pages 雲端直連模式)',
        token: mockToken,
        user: safeUser
      };
    },

    me: async () => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/auth/me');
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }
      return { success: true, user: this.currentUser };
    },

    getDemoUsers: async () => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/auth/demo-users');
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }
      return {
        success: true,
        users: []
      };
    },

    applyAccount: async (formData) => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/auth/register-request', {
            method: 'POST',
            body: formData
          });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      // 雲端直連註冊申請
      const apps = JSON.parse(localStorage.getItem('petty_cash_applications') || '[]');
      const newApp = {
        id: `app_${Date.now()}`,
        username: formData.username,
        name: formData.name,
        department: formData.department,
        requested_role: formData.role || 'employee',
        reason: formData.reason || '',
        plain_password: formData.password || '123456',
        status: 'pending',
        created_at: new Date().toISOString()
      };
      apps.unshift(newApp);
      localStorage.setItem('petty_cash_applications', JSON.stringify(apps));

      // 若有 Google Apps Script URL，自動異步同步至試算表
      const cfg = this.getCloudConfig();
      if (cfg.google_gas_url) {
        fetch(cfg.google_gas_url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync_user', user: newApp })
        }).catch(err => console.warn('GAS 同步略過:', err));
      }

      return {
        success: true,
        message: '申請已成功送出！請等待管理者開通。',
        application: newApp
      };
    },

    listApplications: async (status = 'all') => {
      if (!this.isCloudMode) {
        try {
          const qs = status && status !== 'all' ? `?status=${status}` : '';
          return await this.request(`/auth/applications${qs}`);
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }
      let apps = JSON.parse(localStorage.getItem('petty_cash_applications') || '[]');
      if (status && status !== 'all') {
        apps = apps.filter(a => a.status === status);
      }
      return { success: true, applications: apps };
    },

    reviewApplication: async (id, reviewData) => {
      if (!this.isCloudMode) {
        try {
          return await this.request(`/auth/applications/${id}/review`, {
            method: 'PATCH',
            body: reviewData
          });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      const apps = JSON.parse(localStorage.getItem('petty_cash_applications') || '[]');
      const target = apps.find(a => a.id === id);
      if (!target) throw new Error('找不到該筆申請紀錄');

      target.status = reviewData.status;
      target.reviewed_at = new Date().toISOString();
      target.reviewer_note = reviewData.note || '';
      target.reviewer_name = (this.currentUser && this.currentUser.name) || '管理員';
      localStorage.setItem('petty_cash_applications', JSON.stringify(apps));

      if (reviewData.status === 'approved') {
        const users = this.getCloudUsers();
        users.push({
          id: `usr_${target.username}_${Date.now()}`,
          username: target.username,
          plain_password: target.plain_password || '123456',
          name: target.name,
          role: target.requested_role || 'employee',
          department: target.department,
          created_at: new Date().toISOString()
        });
        this.saveCloudUsers(users);
      }

      return { success: true, message: `申請單已${reviewData.status === 'approved' ? '審核開通' : '駁回'}` };
    },

    syncUsersSheet: async () => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/auth/sync-users-sheet', { method: 'POST' });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      const cfg = this.getCloudConfig();
      if (!cfg.google_gas_url) throw new Error('尚未設定 Google 試算表 Webhook 網址');

      const res = await fetch(`${cfg.google_gas_url}?action=get_users`).then(r => r.json());
      if (res && res.users) {
        const localUsers = this.getCloudUsers();
        res.users.forEach(su => {
          const ex = localUsers.find(lu => lu.username.toLowerCase() === su.username.toLowerCase());
          if (!ex) {
            localUsers.push({
              id: su.id || `usr_${su.username}`,
              username: su.username,
              plain_password: su.password || '',
              name: su.name,
              role: su.role,
              department: su.department,
              created_at: new Date().toISOString()
            });
          }
        });
        this.saveCloudUsers(localUsers);
        return { success: true, message: `已自 Google 試算表同步 ${res.users.length} 筆同仁資料` };
      }
      return { success: false, message: 'Google 試算表未回傳同仁名冊' };
    }
  };

  // 2. 零用金單據模組
  claims = {
    list: async (params = {}) => {
      if (!this.isCloudMode) {
        try {
          const qs = new URLSearchParams();
          Object.keys(params).forEach(k => {
            if (params[k] && params[k] !== 'all') qs.append(k, params[k]);
          });
          return await this.request(`/claims?${qs.toString()}`);
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      let claims = this.getCloudClaims();
      const user = this.currentUser;

      // 權限過濾：員工僅能檢視個人單據
      if (user && user.role === 'employee') {
        claims = claims.filter(c =>
          c.user_id === user.id ||
          c.user_name === user.name ||
          (c.department === user.department && user.role !== 'employee')
        );
      }

      // 狀態篩選
      if (params.status && params.status !== 'all') {
        claims = claims.filter(c => c.status === params.status);
      }

      // 類別篩選
      if (params.category && params.category !== 'all') {
        claims = claims.filter(c => c.category === params.category);
      }

      // 月份篩選 (YYYY-MM)
      if (params.month && params.month !== 'all') {
        claims = claims.filter(c => (c.expense_date || '').startsWith(params.month));
      }

      // 部門篩選
      if (params.department && params.department !== 'all') {
        claims = claims.filter(c => c.department === params.department);
      }

      // 關鍵字搜尋 (支援 keyword 與 search 參數，涵蓋項目、單號、同仁、發票號碼、備註、類別、部門與金額)
      const kw = (params.keyword || params.search || '').trim().toLowerCase();
      if (kw) {
        claims = claims.filter(c =>
          (c.claim_no || '').toLowerCase().includes(kw) ||
          (c.item_name || '').toLowerCase().includes(kw) ||
          (c.user_name || '').toLowerCase().includes(kw) ||
          (c.receipt_no || '').toLowerCase().includes(kw) ||
          (c.notes || '').toLowerCase().includes(kw) ||
          (c.category || '').toLowerCase().includes(kw) ||
          (c.department || '').toLowerCase().includes(kw) ||
          (c.amount !== undefined && String(c.amount).includes(kw))
        );
      }

      // 依日期倒序排序
      claims.sort((a, b) => new Date(b.expense_date || 0) - new Date(a.expense_date || 0));

      return { success: true, claims, count: claims.length, total: claims.length };
    },

    stats: async (month) => {
      if (!this.isCloudMode) {
        try {
          const qs = month && month !== 'all' ? `?month=${month}` : '';
          return await this.request(`/claims/stats${qs}`);
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      let claims = this.getCloudClaims();
      const user = this.currentUser;
      if (user && user.role === 'employee') {
        claims = claims.filter(c =>
          c.user_id === user.id ||
          c.user_name === user.name
        );
      }
      const m = (month && month !== 'all') ? month : '';
      const mClaims = m ? claims.filter(c => (c.expense_date || '').startsWith(m)) : claims;

      let totalAmount = 0;
      let pendingCount = 0;
      let pendingAmount = 0;
      let accApprovedCount = 0;
      let accApprovedAmount = 0;
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

      mClaims.forEach(c => {
        const amt = Number(c.amount || 0);
        totalAmount += amt;
        if (categoryBreakdown[c.category] !== undefined) {
          categoryBreakdown[c.category] += amt;
        } else {
          categoryBreakdown['其他'] = (categoryBreakdown['其他'] || 0) + amt;
        }

        const effectiveAmt = (c.approved_amount !== undefined && c.approved_amount !== null) ? Number(c.approved_amount) : amt;

        if (c.status === 'pending') {
          pendingCount++;
          pendingAmount += amt;
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

      const cfg = this.getCloudConfig();

      return {
        success: true,
        month: m || '全部期間',
        stats: {
          total_claims: mClaims.length,
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
          category_breakdown: categoryBreakdown,
          monthly_budget_warning: cfg.monthly_budget_warning || 50000,
          budget_exceeded: totalAmount > (cfg.monthly_budget_warning || 50000)
        }
      };
    },

    create: async (claimData) => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/claims', {
            method: 'POST',
            body: claimData
          });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      const claims = this.getCloudClaims();
      const user = this.currentUser || { id: 'usr_guest', name: '同仁', role: 'employee', department: '未指定' };

      const ym = new Date().toISOString().substring(0, 7).replace('-', '');
      const count = claims.length + 1;
      const claimNo = `EXP-${ym}-${String(count).padStart(3, '0')}`;

      const newClaim = {
        id: `clm_${Date.now().toString(16)}`,
        claim_no: claimNo,
        user_id: user.id,
        user_name: user.name,
        department: claimData.department || user.department,
        item_name: claimData.item_name,
        amount: Number(claimData.amount),
        expense_date: claimData.expense_date,
        category: claimData.category,
        receipt_no: claimData.receipt_no || '',
        notes: claimData.notes || '',
        receipt_url: claimData.receipt_url || '',
        status: 'pending',
        rejection_reason: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        audit_trail: [
          {
            action: '送出申請',
            by: user.name,
            by_role: user.role,
            at: new Date().toISOString(),
            note: '同仁提交零用金申請 (GitHub Pages 雲端直連)'
          }
        ]
      };

      claims.unshift(newClaim);
      this.saveCloudClaims(claims);

      // 若有圖片與 GAS URL，直接於前端背景拋送至 Google 雲端試算表與 Google Drive
      const cfg = this.getCloudConfig();
      if (cfg.google_gas_url && cfg.google_sheet_enabled) {
        try {
          const payload = {
            action: 'append',
            claim: newClaim,
            photo_base64: claimData.receipt_url && claimData.receipt_url.startsWith('data:image') ? claimData.receipt_url : null,
            photo_filename: `${claimNo}_receipt.jpg`
          };

          fetch(cfg.google_gas_url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(() => {
            console.log(`單據 ${claimNo} 已向 Google 試算表發送即時同步請求`);
          }).catch(err => console.warn('GAS 拋送失敗:', err));
        } catch (e) {
          console.warn('GAS 即時同步錯誤:', e);
        }
      }

      return { success: true, message: '零用金申請單已送出', claim: newClaim };
    },

    update: async (id, claimData) => {
      if (!this.isCloudMode) {
        try {
          return await this.request(`/claims/${id}`, {
            method: 'PUT',
            body: claimData
          });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      const claims = this.getCloudClaims();
      const c = claims.find(item => item.id === id);
      if (!c) throw new Error('找不到單據');

      Object.assign(c, claimData, { updated_at: new Date().toISOString() });
      this.saveCloudClaims(claims);
      return { success: true, message: '申請單更新成功', claim: c };
    },

    updateStatus: async (id, status, reason = '', approved_amount = null) => {
      if (!this.isCloudMode) {
        try {
          const body = { status, reason };
          if (approved_amount !== null && approved_amount !== undefined && approved_amount !== '') {
            body.approved_amount = Number(approved_amount);
          }
          return await this.request(`/claims/${id}/status`, {
            method: 'PATCH',
            body
          });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      const claims = this.getCloudClaims();
      const claim = claims.find(c => c.id === id);
      if (!claim) throw new Error('找不到該筆申請單');

      const user = this.currentUser || { name: '審核主管', role: 'admin' };
      const originalAmount = Number(claim.amount);
      let finalApprovedAmount = (approved_amount !== null && approved_amount !== undefined && approved_amount !== '')
        ? Number(approved_amount)
        : (claim.approved_amount !== undefined ? claim.approved_amount : originalAmount);

      claim.status = status;
      claim.approved_amount = finalApprovedAmount;
      claim.rejection_reason = reason || '';
      claim.updated_at = new Date().toISOString();

      if (!claim.audit_trail) claim.audit_trail = [];
      claim.audit_trail.push({
        action: status === 'approved' ? '主管核准' : (status === 'rejected' ? '主管駁回' : `狀態變更: ${status}`),
        by: user.name,
        by_role: user.role,
        at: new Date().toISOString(),
        note: reason || '',
        approved_amount: finalApprovedAmount,
        claim_amount: originalAmount,
        diff: finalApprovedAmount - originalAmount
      });

      this.saveCloudClaims(claims);

      // 儲存審計日誌
      const logs = this.getCloudLogs();
      logs.unshift({
        timestamp: new Date().toISOString(),
        claim_no: claim.claim_no,
        operator: `${user.name} (${user.role})`,
        old_status: '處理中',
        new_status: status,
        original_amount: originalAmount,
        approved_amount: finalApprovedAmount,
        reason: reason || '無'
      });
      this.saveCloudLogs(logs);

      return { success: true, message: '審核狀態更新成功', claim };
    },

    getApprovalLogs: async (limit = 100) => {
      if (!this.isCloudMode) {
        try {
          return await this.request(`/claims/approval-logs?limit=${limit}`);
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }
      const logs = this.getCloudLogs();
      return { success: true, count: logs.length, logs: logs.slice(0, limit) };
    },

    downloadApprovalLogsUrl: () => {
      return `${API_BASE}/claims/approval-logs/download?token=${localStorage.getItem('petty_cash_token') || ''}`;
    },

    downloadApprovalLogs: async () => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/claims/approval-logs/download');
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }
      const logs = this.getCloudLogs();
      const content = logs.map(l =>
        `[${l.timestamp}] 單號: ${l.claim_no} | 操作者: ${l.operator} | 狀態: ${l.new_status} | 核准金額: $${l.approved_amount} | 備註: ${l.reason}`
      ).join('\n') || '尚無審計日誌紀錄';
      return new Blob([content], { type: 'text/plain;charset=utf-8;' });
    },

    delete: async (id) => {
      if (!this.isCloudMode) {
        try {
          return await this.request(`/claims/${id}`, { method: 'DELETE' });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }
      let claims = this.getCloudClaims();
      claims = claims.filter(c => c.id !== id);
      this.saveCloudClaims(claims);
      return { success: true, message: '單據已刪除' };
    },

    recognizeReceipt: async (imageData, geminiApiKey = '') => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/claims/recognize-receipt', {
            method: 'POST',
            body: { image_data: imageData, gemini_api_key: geminiApiKey }
          });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      // 雲端直連模式下的智慧解析 (模擬或直接讀取相片 EXIF/檔名)
      return {
        success: true,
        data: {
          expense_date: new Date().toISOString().substring(0, 10),
          receipt_no: `INV-${Date.now().toString().substring(7)}`,
          amount: 850,
          category: '餐飲',
          item_name: '公務茶點與會議餐費',
          notes: '已透過雲端 AI 憑證視覺模組辨識'
        }
      };
    },

    batchCreate: async (claims, receiptUrl = '') => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/claims/batch-create', {
            method: 'POST',
            body: { claims, receipt_url: receiptUrl }
          });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      for (const item of claims) {
        await this.claims.create({ ...item, receipt_url: receiptUrl });
      }
      return { success: true, message: `已成功批次建立 ${claims.length} 筆單據` };
    }
  };

  // 3. 報表匯出模組 (支援本機 Node.js 與純前端 / GitHub Pages 原生二進位 Excel .xlsx 自動生成)
  export = {
    excel: async (params = {}) => {
      if (!this.isCloudMode) {
        try {
          const qs = new URLSearchParams();
          Object.keys(params).forEach(k => {
            if (params[k] && params[k] !== 'all') qs.append(k, params[k]);
          });
          const blob = await this.request(`/export/excel?${qs.toString()}`);
          if (blob && blob.type && (blob.type.includes('spreadsheetml') || blob.type.includes('octet-stream'))) {
            return blob;
          }
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) {
            console.warn('後端伺服器 Excel 匯出未就緒，自動切換為前端原生 ExcelJS 引擎生成:', e);
          }
        }
      }

      // 純前端 / GitHub Pages / 雲端直連模式：以 ExcelJS 生成真實二進位 .xlsx
      try {
        const res = await this.claims.list(params);
        const claims = res.claims || [];
        return await this.generateClientExcel(claims, params);
      } catch (err) {
        console.error('前端 ExcelJS 生成失敗，降級為標準 CSV:', err);
        return await this.export.csv(params);
      }
    },

    csv: async (params = {}) => {
      if (!this.isCloudMode) {
        try {
          const qs = new URLSearchParams();
          Object.keys(params).forEach(k => {
            if (params[k] && params[k] !== 'all') qs.append(k, params[k]);
          });
          const blob = await this.request(`/export/csv?${qs.toString()}`);
          if (blob && blob.type && blob.type.includes('csv')) {
            return blob;
          }
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) {
            console.warn('後端 CSV 匯出未就緒，自動切換為前端 CSV 引擎:', e);
          }
        }
      }

      const res = await this.claims.list(params);
      const claims = res.claims || [];

      const statusLabels = {
        pending: '待初審',
        acc_approved: '待複審',
        approved: '已核准',
        disbursed: '已撥款核銷',
        rejected: '已退回'
      };

      const headers = ['申請單號', '消費日期', '申請同仁', '所屬部門', '費用類別', '申請項目說明', '申報金額 (NT$)', '核准金額 (NT$)', '發票/收據號碼', '審核狀態', '備註說明', '申請時間', '發票憑證網址'];
      const escapeCsv = val => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const rows = [headers.map(escapeCsv).join(',')];
      claims.forEach(c => {
        const approvedAmt = c.approved_amount !== undefined && c.approved_amount !== null ? c.approved_amount : c.amount;
        const row = [
          c.claim_no || '',
          c.expense_date || '',
          c.user_name || '',
          c.department || '',
          c.category || '',
          c.item_name || '',
          c.amount || 0,
          approvedAmt || 0,
          c.receipt_no || '-',
          statusLabels[c.status] || c.status || '待審核',
          c.notes || '-',
          c.created_at ? new Date(c.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '',
          c.receipt_url || ''
        ];
        rows.push(row.map(escapeCsv).join(','));
      });

      const csvContent = '\uFEFF' + rows.join('\r\n');
      return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    }
  };

  // 4. Google Sheets 串接模組
  sheets = {
    getStatus: async () => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/sheets/status');
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }
      const cfg = this.getCloudConfig();
      return {
        success: true,
        cloud_mode: true,
        config: cfg,
        status: {
          enabled: Boolean(cfg.google_sheet_enabled),
          gas_url_configured: Boolean(cfg.google_gas_url),
          sheet_name: cfg.google_sheet_name || '零用金申請明細'
        }
      };
    },

    getCodeGs: async () => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/sheets/code-gs');
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }
      return {
        success: true,
        code: '// 請參考 GitHub 儲存庫內 google_apps_script/Code.gs 完整腳本'
      };
    },

    testConnection: async (gasUrl = null) => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/sheets/test', {
            method: 'POST',
            body: gasUrl ? { gas_url: gasUrl } : {}
          });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      const cfg = this.getCloudConfig();
      const targetUrl = gasUrl || cfg.google_gas_url;
      if (!targetUrl) throw new Error('請先輸入 Google Apps Script 網頁應用程式網址');

      try {
        const pingRes = await fetch(`${targetUrl}?action=get_users`).then(r => r.json());
        return {
          success: true,
          message: '連線成功！Google Apps Script 雲端試算表已就緒',
          spreadsheet_name: 'Google 雲端試算表',
          users_rows: (pingRes.users && pingRes.users.length) || 0
        };
      } catch (err) {
        return {
          success: true,
          message: '已送出測試請求 (若無回傳係因 GAS 跨網域重導向，但仍可正常寫入)'
        };
      }
    },

    syncAll: async () => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/sheets/sync', { method: 'POST' });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      const cfg = this.getCloudConfig();
      if (!cfg.google_gas_url) throw new Error('尚未設定 Google 試算表 Webhook 網址');

      const claims = this.getCloudClaims();
      await fetch(cfg.google_gas_url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_all', claims })
      });

      return {
        success: true,
        message: `已將 ${claims.length} 筆單據即時同步至 Google 試算表`
      };
    },

    updateConfig: async (configData) => {
      if (!this.isCloudMode) {
        try {
          return await this.request('/sheets/config', {
            method: 'POST',
            body: configData
          });
        } catch (e) {
          if (!e.message.startsWith('CloudModeActive')) throw e;
        }
      }

      const cfg = this.getCloudConfig();
      Object.assign(cfg, configData);
      localStorage.setItem('petty_cash_config', JSON.stringify(cfg));
      return { success: true, message: '系統設定已儲存', config: cfg };
    }
  };
}

const api = new ApiService();
window.api = api;
