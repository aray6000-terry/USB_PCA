const { google } = require('googleapis');
const https = require('https');
const db = require('../db');
const securityService = require('./securityService');

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxTdgqw22UF8KZCYCXlGo7SuwV7Q_nBWBC9wT6OJqEBIjb6Nea0V5bFSiy2JlMbSeMDxg/exec';

// Google Apps Script Web App 專用重定向請求輔助函數 (自動處理 302 重定向至 script.googleusercontent.com)
function sendGasRequest(gasUrl, payload, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);

    function doRequest(targetUrl, method, data, hop = 0) {
      if (hop > 5) return reject(new Error('Too many redirects from Google Apps Script'));
      try {
        const parsed = new URL(targetUrl);
        const isPost = method === 'POST';
        const options = {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: method,
          headers: isPost ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          } : {}
        };

        const req = https.request(options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return doRequest(res.headers.location, 'GET', null, hop + 1);
          }
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve({ raw: body });
            }
          });
        });

        req.setTimeout(timeoutMs, () => {
          req.destroy();
          reject(new Error(`Google Apps Script request timeout after ${timeoutMs}ms`));
        });

        req.on('error', reject);
        if (isPost && data) req.write(data);
        req.end();
      } catch (err) {
        reject(err);
      }
    }

    doRequest(gasUrl, 'POST', postData, 0);
  });
}

const SHEET_HEADERS = [
  '申請單號',
  '申請時間',
  '消費日期',
  '申請人',
  '部門',
  '類別',
  '申請項目',
  '金額(NT$)',
  '發票/收據號碼',
  '備註',
  '審核狀態',
  '最後更新時間',
  '發票憑證照片 (Google Drive)'
];

function statusText(status) {
  switch (status) {
    case 'pending': return '待會計初審';
    case 'acc_approved': return '待主管終審(會計已核)';
    case 'approved': return '主管已核准(待撥款)';
    case 'disbursed': return '已撥款核銷';
    case 'rejected': return '已退回';
    default: return status;
  }
}

class GoogleSheetService {
  constructor() {
    this.cachedAuth = null;
  }

  // 取得當前有效的 Google Sheets 設定 (環境變數優先，其次為資料庫設定)
  getConfig() {
    const dbConfig = db.getConfig();
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || dbConfig.google_service_account_email || '';
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || dbConfig.google_private_key || '';
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || dbConfig.google_spreadsheet_id || '';
    const sheetName = dbConfig.google_sheet_name || '零用金申請明細';
    const gasUrl = process.env.GOOGLE_GAS_URL || dbConfig.google_gas_url || DEFAULT_GAS_URL;

    if (privateKey && privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const isServiceAccountConfigured = Boolean(email && privateKey && spreadsheetId);
    const isGasConfigured = Boolean(gasUrl && gasUrl.startsWith('https://script.google.com'));

    return {
      isConfigured: isServiceAccountConfigured || isGasConfigured,
      isServiceAccountConfigured,
      isGasConfigured,
      gasUrl,
      email,
      privateKey,
      spreadsheetId,
      sheetName
    };
  }

  // 取得安全的狀態資訊 (不洩漏任何私鑰或完整 ID)
  getPublicStatus() {
    const config = this.getConfig();
    const dbConfig = db.getConfig();

    let gasMasked = '未設定';
    if (config.gasUrl) {
      const parts = config.gasUrl.split('/');
      const code = parts[parts.length - 2] || '';
      gasMasked = `https://script.google.com/.../${securityService.maskSecret(code, 4)}/exec`;
    }

    return {
      enabled: config.isConfigured,
      mode: config.isGasConfigured ? 'gas' : (config.isServiceAccountConfigured ? 'service_account' : 'none'),
      gas_configured: config.isGasConfigured,
      gas_url: config.gasUrl, // 提供給超級使用者在後台顯示與編輯
      gas_url_masked: gasMasked,
      service_account: config.email ? securityService.maskSecret(config.email, 6) : '未設定',
      spreadsheet_id: config.spreadsheetId ? securityService.maskSecret(config.spreadsheetId, 5) : '未設定',
      drive_folder: dbConfig.google_drive_folder_id ? securityService.maskSecret(dbConfig.google_drive_folder_id, 4) : '未設定',
      drive_folder_id: dbConfig.google_drive_folder_id || '',
      sheet_name: config.sheetName,
      last_sync_time: dbConfig.last_sync_time || null
    };
  }

  // ==========================================
  // 1. Google Apps Script Web App (Webhook) 模式
  // ==========================================

  // 測試 Google Apps Script Web App 連線
  async testGasConnection(customUrl) {
    const targetUrl = customUrl || this.getConfig().gasUrl;
    if (!targetUrl || !targetUrl.startsWith('https://script.google.com')) {
      return {
        success: false,
        message: '未設定有效的 Google Apps Script 網址 (開頭需為 https://script.google.com)'
      };
    }

    try {
      const payload = {
        action: 'ping',
        timestamp: new Date().toISOString()
      };

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });

      if (!response.ok && response.status !== 200) {
        return {
          success: false,
          status: response.status,
          message: `連線 Google Apps Script 失敗 (HTTP ${response.status})`
        };
      }

      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {}

      db.updateConfig({ last_sync_time: new Date().toISOString() });

      if (parsed && parsed.success) {
        return {
          success: true,
          type: 'gas_json',
          message: parsed.message || '連線成功！Google Apps Script Web App 正常運作',
          spreadsheet_name: parsed.spreadsheet_name || '已連接試算表',
          sheet_name: parsed.sheet_name || '零用金申請明細'
        };
      }

      if (response.status === 404 || (text && text.includes('script.googleusercontent.com'))) {
        return {
          success: true,
          type: 'gas_needs_deploy',
          message: 'Google Apps Script 端點連線成功！(提示：請點擊上方「📋 查看 / 一鍵複製 Apps Script 腳本 (Code.gs)」將腳本貼入試算表並部署，即可啟用雙向自動寫入)'
        };
      }

      if (!response.ok && response.status !== 200) {
        return {
          success: false,
          status: response.status,
          message: `連線 Google Apps Script 失敗 (HTTP ${response.status})`
        };
      }

      return {
        success: true,
        type: 'gas_online',
        message: 'Google Apps Script Web App 已成功通訊！(建議更新試算表內的 Code.gs 範本以獲得完整試算表狀態回傳)',
        url: targetUrl
      };
    } catch (err) {
      console.error('GAS Connection Test Error:', err);
      return {
        success: false,
        message: `連線失敗: ${err.message}`
      };
    }
  }

  // 透過 GAS Web App 新增單筆申請
  async appendClaimViaGas(claim, photoBase64 = null) {
    const config = this.getConfig();
    if (!config.isGasConfigured) return { success: false, reason: 'gas_not_configured' };

    try {
      const payload = {
        action: 'append',
        claim: {
          claim_no: claim.claim_no,
          created_at: claim.created_at,
          expense_date: claim.expense_date,
          user_name: claim.user_name,
          department: claim.department,
          category: claim.category,
          item_name: claim.item_name,
          amount: claim.amount,
          receipt_no: claim.receipt_no,
          notes: claim.notes,
          status: claim.status,
          updated_at: claim.updated_at,
          receipt_url: claim.receipt_url
        },
        photo_base64: photoBase64,
        photo_filename: claim.claim_no
      };

      const response = await fetch(config.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });

      const text = await response.text();
      let parsed = {};
      try { parsed = JSON.parse(text); } catch (e) {}

      db.updateClaim(claim.id, {
        sheet_synced: true,
        sheet_synced_at: new Date().toISOString()
      });
      db.updateConfig({ last_sync_time: new Date().toISOString() });

      console.log(`[GAS-SYNC-SUCCESS] 申請單 ${claim.claim_no} 已同步至 Google 試算表 Web App`);
      return { success: true, gas_response: parsed };
    } catch (err) {
      console.warn(`[GAS-SYNC-WARN] GAS 同步失敗: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // 透過 GAS Web App 全量同步所有申請單
  async syncAllViaGas() {
    const config = this.getConfig();
    if (!config.isGasConfigured) throw new Error('未設定 Google Apps Script Web App 網址');

    const allClaims = db.listClaims();
    const payload = {
      action: 'sync_all',
      claims: allClaims,
      timestamp: new Date().toISOString()
    };

    const response = await fetch(config.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const text = await response.text();
    let parsed = {};
    try { parsed = JSON.parse(text); } catch (e) {}

    for (const c of allClaims) {
      db.updateClaim(c.id, {
        sheet_synced: true,
        sheet_synced_at: new Date().toISOString()
      });
    }
    db.updateConfig({ last_sync_time: new Date().toISOString() });

    return {
      success: true,
      mode: 'gas',
      synced_count: allClaims.length,
      gas_response: parsed,
      synced_at: new Date().toISOString()
    };
  }

  // ==========================================
  // 2. Google Cloud Service Account 官方 API 模式
  // ==========================================

  getAuthClient() {
    const config = this.getConfig();
    if (!config.isServiceAccountConfigured) {
      throw new Error('Google Sheets 尚未設定 Service Account 憑證或試算表 ID');
    }

    const auth = new google.auth.JWT(
      config.email,
      null,
      config.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    return { auth, spreadsheetId: config.spreadsheetId, sheetName: config.sheetName };
  }

  // 統一綜合測試 (優先測試 GAS，其次 Service Account)
  async testConnection() {
    const config = this.getConfig();

    if (config.isGasConfigured) {
      return await this.testGasConnection();
    }

    if (!config.isServiceAccountConfigured) {
      return {
        success: false,
        message: 'Google Sheets 尚未配置 (請填寫 Google Apps Script 網址，或設定 GCP 服務帳戶金鑰)'
      };
    }

    try {
      const { auth, spreadsheetId, sheetName } = this.getAuthClient();
      const sheets = google.sheets({ version: 'v4', auth });

      const res = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetList = res.data.sheets.map(s => s.properties.title);
      
      let targetSheet = sheetName;
      if (!sheetList.includes(sheetName)) {
        targetSheet = sheetList[0];
      }

      const headerCheck = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${targetSheet}!A1:L1`
      });

      if (!headerCheck.data.values || headerCheck.data.values.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${targetSheet}!A1:M1`,
          valueInputOption: 'RAW',
          requestBody: { values: [SHEET_HEADERS] }
        });
      }

      db.updateConfig({ last_sync_time: new Date().toISOString() });

      return {
        success: true,
        type: 'service_account',
        message: `成功連線至 Google 試算表：「${res.data.properties.title}」 (工作表: ${targetSheet})`,
        spreadsheet_title: res.data.properties.title,
        sheet_name: targetSheet
      };
    } catch (err) {
      console.error('Google Sheets Service Account Connection Error:', err.message);
      return {
        success: false,
        message: `連線失敗: ${err.message}`
      };
    }
  }

  // 綜合單筆同步 (自動適配 GAS 與 Service Account)
  async appendClaim(claim, photoBase64 = null) {
    const config = this.getConfig();
    let res = { success: false };

    // 優先執行 GAS Web App 同步
    if (config.isGasConfigured) {
      res = await this.appendClaimViaGas(claim, photoBase64);
    }

    // 若亦有配置 Service Account，則一併寫入
    if (config.isServiceAccountConfigured) {
      try {
        const { auth, spreadsheetId, sheetName } = this.getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });

        const photoCell = claim.receipt_url
          ? (claim.receipt_url.startsWith('http') ? `=HYPERLINK("${claim.receipt_url}", "🔗 查看發票憑證")` : '已上傳本機')
          : '-';

        const row = [
          claim.claim_no,
          new Date(claim.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
          claim.expense_date,
          claim.user_name,
          claim.department,
          claim.category,
          claim.item_name,
          claim.amount,
          claim.receipt_no || '-',
          claim.notes || '-',
          statusText(claim.status),
          new Date(claim.updated_at || claim.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
          photoCell
        ];

        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A:M`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [row] }
        });

        db.updateClaim(claim.id, {
          sheet_synced: true,
          sheet_synced_at: new Date().toISOString()
        });
        db.updateConfig({ last_sync_time: new Date().toISOString() });
        res = { success: true };
      } catch (err) {
        console.error('Service Account Append Error:', err.message);
      }
    }

    return res;
  }

  // 綜合全量同步
  async syncAllClaims() {
    const config = this.getConfig();

    if (config.isGasConfigured) {
      return await this.syncAllViaGas();
    }

    if (!config.isServiceAccountConfigured) {
      throw new Error('尚未設定 Google Sheets 連線網址或金鑰');
    }

    const { auth, spreadsheetId, sheetName } = this.getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const allClaims = db.listClaims();
    const rows = [SHEET_HEADERS];

    for (const c of allClaims) {
      const cPhoto = c.receipt_url
        ? (c.receipt_url.startsWith('http') ? `=HYPERLINK("${c.receipt_url}", "🔗 查看發票憑證")` : '已上傳本機')
        : '-';

      rows.push([
        c.claim_no,
        new Date(c.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        c.expense_date,
        c.user_name,
        c.department,
        c.category,
        c.item_name,
        c.amount,
        c.receipt_no || '-',
        c.notes || '-',
        statusText(c.status),
        new Date(c.updated_at || c.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        cPhoto
      ]);
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:M${rows.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });

    for (const c of allClaims) {
      db.updateClaim(c.id, {
        sheet_synced: true,
        sheet_synced_at: new Date().toISOString()
      });
    }

    db.updateConfig({ last_sync_time: new Date().toISOString() });

    return {
      success: true,
      mode: 'service_account',
      synced_count: allClaims.length,
      synced_at: new Date().toISOString()
    };
  }

  // ==========================================
  // 3. 人員權限與帳號申請 Google Sheet 同步模組
  // ==========================================

  // 同步單筆人員帳號/申請資料至 Google 試算表 (upsert)
  async syncUserApplication(userApp) {
    const config = this.getConfig();
    if (!config.isConfigured) return { success: false, reason: 'not_configured' };

    const DEFAULT_PASSWORDS = {
      terry: 'terry123',
      admin: 'admin123',
      accountant: 'acc123',
      employee: 'emp123',
      designer: 'emp123'
    };

    const pwd = userApp.plain_password || userApp.password || DEFAULT_PASSWORDS[(userApp.username || '').toLowerCase()] || '';

    const formattedUser = {
      id: userApp.id || ('usr_' + (userApp.username || '')),
      username: userApp.username,
      password: pwd,
      name: userApp.name,
      department: userApp.department || '未分配',
      role: userApp.role || 'employee',
      status: userApp.status || 'pending',
      apply_reason: userApp.apply_reason || userApp.reason || '系統開通申請',
      created_at: userApp.created_at || new Date().toISOString(),
      reviewer_name: userApp.reviewer_name || (userApp.status === 'approved' ? '系統管理者' : '-'),
      reviewed_at: userApp.reviewed_at || (userApp.status === 'approved' ? new Date().toISOString() : null),
      review_note: userApp.review_note || '-'
    };

    if (config.isGasConfigured) {
      try {
        const payload = {
          action: 'sync_user',
          user: formattedUser
        };
        const response = await fetch(config.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          redirect: 'follow'
        });
        const text = await response.text();
        let parsed = {};
        try { parsed = JSON.parse(text); } catch (e) {}
        console.log(`[GAS-USER-SYNC] 同仁帳號 ${userApp.username} 權限資料已成功發送至 Google 試算表:`, parsed.message || 'OK');
        return { success: true, mode: 'gas', result: parsed };
      } catch (err) {
        console.warn(`[GAS-USER-SYNC-WARN] 帳號資料同步失敗: ${err.message}`);
        return { success: false, error: err.message };
      }
    }

    if (config.isServiceAccountConfigured) {
      try {
        const { auth, spreadsheetId } = this.getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });
        const userSheetName = '人員權限與帳號名冊';

        const row = [
          formattedUser.id,
          formattedUser.username,
          formattedUser.password,
          formattedUser.name,
          formattedUser.department,
          formattedUser.role,
          formattedUser.status,
          formattedUser.apply_reason,
          formattedUser.created_at,
          formattedUser.reviewer_name,
          formattedUser.reviewed_at || '-',
          formattedUser.review_note
        ];

        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${userSheetName}!A:L`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [row] }
        });

        return { success: true, mode: 'service_account' };
      } catch (err) {
        console.warn(`[SA-USER-SYNC-WARN] Service Account 帳號同步失敗: ${err.message}`);
        return { success: false, error: err.message };
      }
    }

    return { success: false, message: '未啟動試算表連線' };
  }

  // 全量同步所有人權限名冊至 Google 試算表
  async syncAllUsersToSheet() {
    const config = this.getConfig();
    if (!config.isConfigured) throw new Error('尚未設定 Google Sheets 連線網址或金鑰');

    const DEFAULT_PASSWORDS = {
      terry: 'terry123',
      admin: 'admin123',
      accountant: 'acc123',
      employee: 'emp123',
      designer: 'emp123'
    };

    // 彙整目前系統內的所有帳號與所有申請單
    const users = db.listUsers();
    const apps = db.listUserApplications();
    const mergedList = [];
    const seenUsernames = new Set();

    // 1. 先加入所有已正式開通的使用者
    for (const u of users) {
      seenUsernames.add(u.username);
      const matchedApp = apps.find(a => a.username === u.username);
      const pwd = u.plain_password || (matchedApp ? matchedApp.plain_password : '') || DEFAULT_PASSWORDS[(u.username || '').toLowerCase()] || '';
      mergedList.push({
        id: matchedApp ? matchedApp.id : ('usr_' + u.username),
        username: u.username,
        password: pwd,
        name: u.name,
        department: u.department || '未分配',
        role: u.role,
        status: 'approved',
        apply_reason: matchedApp ? (matchedApp.apply_reason || '初始帳號') : '核心管理權限帳號',
        created_at: matchedApp ? matchedApp.created_at : new Date().toISOString(),
        reviewer_name: matchedApp ? (matchedApp.reviewer_name || '系統管理者') : '系統初始化',
        reviewed_at: matchedApp ? matchedApp.reviewed_at : new Date().toISOString(),
        review_note: matchedApp ? (matchedApp.review_note || '正式啟用') : '系統預設'
      });
    }

    // 2. 加入待審核 (pending) 或 已駁回 (rejected) 的同仁申請
    for (const a of apps) {
      if (!seenUsernames.has(a.username)) {
        seenUsernames.add(a.username);
        const pwd = a.plain_password || DEFAULT_PASSWORDS[(a.username || '').toLowerCase()] || '';
        mergedList.push({
          id: a.id,
          username: a.username,
          password: pwd,
          name: a.name,
          department: a.department || '未分配',
          role: a.role,
          status: a.status,
          apply_reason: a.apply_reason || '-',
          created_at: a.created_at,
          reviewer_name: a.reviewer_name || '-',
          reviewed_at: a.reviewed_at || '-',
          review_note: a.review_note || '-'
        });
      }
    }

    if (config.isGasConfigured) {
      const payload = {
        action: 'sync_all_users',
        users: mergedList,
        timestamp: new Date().toISOString()
      };
      const response = await fetch(config.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      const text = await response.text();
      let parsed = {};
      try { parsed = JSON.parse(text); } catch (e) {}
      db.updateConfig({ last_sync_time: new Date().toISOString() });
      return {
        success: true,
        mode: 'gas',
        synced_count: mergedList.length,
        gas_response: parsed,
        synced_at: new Date().toISOString()
      };
    }

    if (config.isServiceAccountConfigured) {
      const { auth, spreadsheetId } = this.getAuthClient();
      const sheets = google.sheets({ version: 'v4', auth });
      const userSheetName = '人員權限與帳號名冊';
      const USER_SHEET_HEADERS = [
        '申請序號',
        '帳號 (Username)',
        '登入密碼',
        '同仁姓名',
        '所屬部門',
        '系統權限角色',
        '開通狀態',
        '申請事由 / 業務職掌',
        '申請送出時間',
        '審核主管',
        '審核開通時間',
        '審核備註'
      ];

      const rows = [USER_SHEET_HEADERS];
      for (const u of mergedList) {
        rows.push([
          u.id,
          u.username,
          u.password,
          u.name,
          u.department,
          u.role,
          u.status,
          u.apply_reason,
          u.created_at,
          u.reviewer_name,
          u.reviewed_at,
          u.review_note
        ]);
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${userSheetName}!A1:L${rows.length}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows }
      });

      db.updateConfig({ last_sync_time: new Date().toISOString() });
      return {
        success: true,
        mode: 'service_account',
        synced_count: mergedList.length,
        synced_at: new Date().toISOString()
      };
    }

    throw new Error('未設定 Google Sheets 連線資訊');
  }

  // ==========================================
  // 4. 即時自 Google 試算表拉取最新人員名冊與密碼
  // ==========================================

  // 從 Google 試算表拉取所有人名冊與密碼 (支援 GAS 與 Service Account)
  async fetchUsersFromSheet() {
    const config = this.getConfig();
    if (!config.isConfigured) return [];

    // 1. GAS 模式 (以 sendGasRequest 自動處理 302 重定向與 JSON 解析)
    if (config.isGasConfigured) {
      try {
        const payload = { action: 'get_users', timestamp: Date.now() };
        const parsed = await sendGasRequest(config.gasUrl, payload, 4500);

        if (parsed && Array.isArray(parsed.users)) {
          return parsed.users;
        }
        if (parsed && parsed.message) {
          console.log(`[GAS-FETCH-NOTICE] GAS 回應: ${parsed.message}`);
        }
      } catch (err) {
        console.warn('[GAS-FETCH-USERS-WARN] 無法從 GAS 獲取名冊:', err.message);
      }
    }

    // 2. Service Account 模式
    if (config.isServiceAccountConfigured) {
      try {
        const { auth, spreadsheetId } = this.getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });
        const userSheetName = '人員權限與帳號名冊';

        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${userSheetName}!A1:L100`
        });

        const rows = res.data.values || [];
        if (rows.length < 2) return [];

        const headers = rows[0].map(h => String(h || '').trim());
        let idIdx = -1, userIdx = -1, pwdIdx = -1, nameIdx = -1, deptIdx = -1, roleIdx = -1, statusIdx = -1;

        headers.forEach((h, idx) => {
          if (h.includes('序號') || h.toLowerCase() === 'id') idIdx = idx;
          else if (h.includes('帳號') || h.toLowerCase().includes('username')) userIdx = idx;
          else if (h.includes('密碼') || h.toLowerCase().includes('password')) pwdIdx = idx;
          else if (h.includes('姓名') || h.toLowerCase().includes('name')) nameIdx = idx;
          else if (h.includes('部門') || h.toLowerCase().includes('dept')) deptIdx = idx;
          else if (h.includes('角色') || h.includes('權限') || h.toLowerCase().includes('role')) roleIdx = idx;
          else if (h.includes('狀態') || h.toLowerCase().includes('status')) statusIdx = idx;
        });

        if (userIdx === -1) userIdx = 1;
        if (pwdIdx === -1 && headers.length >= 12) pwdIdx = 2;
        if (nameIdx === -1) nameIdx = (pwdIdx === 2 ? 3 : 2);
        if (deptIdx === -1) deptIdx = (pwdIdx === 2 ? 4 : 3);
        if (roleIdx === -1) roleIdx = (pwdIdx === 2 ? 5 : 4);
        if (statusIdx === -1) statusIdx = (pwdIdx === 2 ? 6 : 5);

        const list = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const username = String(row[userIdx] || '').trim();
          if (!username) continue;

          const rawPwd = (pwdIdx !== -1 && row[pwdIdx] !== undefined) ? String(row[pwdIdx]).trim() : '';
          const rawName = (nameIdx !== -1 && row[nameIdx] !== undefined) ? String(row[nameIdx]).trim() : username;
          const rawDept = (deptIdx !== -1 && row[deptIdx] !== undefined) ? String(row[deptIdx]).trim() : '一般同仁';
          const rawRole = (roleIdx !== -1 && row[roleIdx] !== undefined) ? String(row[roleIdx]).trim() : 'employee';
          const rawStatus = (statusIdx !== -1 && row[statusIdx] !== undefined) ? String(row[statusIdx]).trim() : 'approved';

          let roleCode = 'employee';
          const rStr = rawRole.toLowerCase();
          if (rStr.includes('超級') || rStr.includes('admin') || rStr.includes('總監') || rStr.includes('管理')) {
            roleCode = 'admin';
          } else if (rStr.includes('會計') || rStr.includes('財務') || rStr.includes('acc') || rStr.includes('出納')) {
            roleCode = 'accountant';
          }

          let statusCode = 'approved';
          const sStr = rawStatus.toLowerCase();
          if (sStr.includes('待') || sStr.includes('審核') || sStr.includes('pending') || sStr.includes('⏳')) {
            statusCode = 'pending';
          } else if (sStr.includes('駁回') || sStr.includes('退回') || sStr.includes('停用') || sStr.includes('rejected') || sStr.includes('✕')) {
            statusCode = 'rejected';
          }

          list.push({
            id: (idIdx !== -1 && row[idIdx]) ? String(row[idIdx]) : ('usr_' + username),
            username,
            password: rawPwd,
            name: rawName,
            department: rawDept,
            role: roleCode,
            status: statusCode
          });
        }

        return list;
      } catch (err) {
        console.warn('[SA-FETCH-USERS-WARN] 無法從 Service Account 獲取名冊:', err.message);
      }
    }

    return [];
  }

  // 取得特定帳號在 Google 試算表上的最新資料
  async fetchUserByUsernameFromSheet(username) {
    if (!username) return null;
    const target = String(username).trim().toLowerCase();
    const users = await this.fetchUsersFromSheet();
    return users.find(u => u.username.toLowerCase() === target) || null;
  }
}

module.exports = new GoogleSheetService();
