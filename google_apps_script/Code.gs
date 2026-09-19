/**
 * 企業每月零用金申請與核銷系統 - Google Apps Script (GAS) Web App 串接腳本
 * 
 * 支援功能：
 * 1. 零用金報銷單據自動同步至「零用金申請明細」工作表
 * 2. 同仁新帳號申請與權限審核自動同步至「人員權限與帳號名冊」工作表
 * 3. 發票相片自動歸檔至指定 Google Drive 雲端資料夾並產生檢視超連結
 * 
 * 【部署說明】
 * 1. 在您的 Google 試算表 (Google Sheets) 點選上方選單：「擴充功能」->「Apps Script」
 * 2. 清空原本的 Code.gs，將本檔案內容全部複製貼上
 * 3. 點選右上角「部署」->「新部署」
 * 4. 種類選擇「網頁應用程式 (Web App)」
 *    - 說明：零用金系統與權限管理串接
 *    - 誰可以存取 (Who has access)：選擇「所有人 (Anyone)」(關鍵！)
 * 5. 點擊「部署」，授權 Google 帳號權限
 * 6. 將產生的「網頁應用程式網址 (結尾為 /exec)」貼回零用金系統後台即可！
 */

var CLAIMS_SHEET_NAME = '零用金申請明細';
var USER_SHEET_NAME = '人員權限與帳號名冊';
var FOLDER_NAME = '零用金發票憑證資料夾';
// 指定的 Google Drive 雲端資料夾 ID (發票照片將自動存入此資料夾)
var FOLDER_ID = '1TlGIxQu8ZIso3wL8wzAbDpwNwxIFOHut';
var SCRIPT_VERSION = 'v2.2-realtime-auth';

// 零用金單據標題欄
var CLAIM_HEADERS = [
  '申請單號',
  '申請時間',
  '消費日期',
  '申請人',
  '部門',
  '費用類別',
  '申請項目',
  '金額 (NT$)',
  '發票/收據號碼',
  '備註說明',
  '審核狀態',
  '最後更新時間',
  '發票憑證 (Google Drive)'
];

// 人員權限與帳號名冊標題欄 (第 3 欄為登入密碼)
var USER_HEADERS = [
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

// 處理 GET 請求 (直接在瀏覽器開啟時顯示狀態，亦支援 API 查詢)
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 支援 API 查詢人員名冊與最新密碼
  if (e && e.parameter && (e.parameter.action === 'get_users' || e.parameter.action === 'fetch_users')) {
    var userSheet = getOrCreateUserSheet(ss);
    var usersList = parseUserRowsFromSheet(userSheet);
    return jsonResponse({
      success: true,
      version: SCRIPT_VERSION,
      count: usersList.length,
      users: usersList
    });
  }

  var claimSheet = getOrCreateClaimSheet(ss);
  var userSheet = getOrCreateUserSheet(ss);
  var claimCount = Math.max(0, claimSheet.getLastRow() - 1);
  var userCount = Math.max(0, userSheet.getLastRow() - 1);
  
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>零用金系統 Google 串接狀態</title>'
    + '<style>'
    + 'body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}'
    + '.card{background:#1e293b;padding:32px;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,0.5);border:1px solid #334155;max-width:560px;width:90%;text-align:center;}'
    + 'h2{color:#38bdf8;margin-top:0;font-size:24px;}'
    + '.badge{display:inline-block;padding:6px 14px;background:#059669;color:#fff;border-radius:9999px;font-weight:bold;font-size:14px;margin-bottom:16px;}'
    + '.info{text-align:left;background:#0f172a;padding:16px;border-radius:8px;margin-top:16px;font-size:14px;line-height:1.7;color:#cbd5e1;}'
    + '</style></head><body><div class="card">'
    + '<div class="badge">● Webhook 運作正常 (版本: ' + SCRIPT_VERSION + ')</div>'
    + '<h2>企業零用金與人員權限管理 - Google 串接端點</h2>'
    + '<p>已就緒接收報銷單據與人員權限申請自動拋送 (包含登入密碼即時同步判斷)。</p>'
    + '<div class="info">'
    + '<div><strong>試算表名稱：</strong> ' + ss.getName() + '</div>'
    + '<div><strong>單據工作表：</strong> ' + claimSheet.getName() + ' (' + claimCount + ' 筆)</div>'
    + '<div><strong>權限工作表：</strong> ' + userSheet.getName() + ' (' + userCount + ' 筆)</div>'
    + '<div><strong>密碼欄位狀態：</strong> 已啟用 (第 3 欄)</div>'
    + '<div><strong>系統時間：</strong> ' + new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) + '</div>'
    + '</div>'
    + '</div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('零用金系統 Google 串接端點')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 處理 POST 請求
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(30000); // 鎖定防並行衝突

  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(raw);
    var action = payload.action || 'append';

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 0. 即時讀取試算表上所有同仁帳號與最新密碼 (供登入驗證)
    if (action === 'get_users' || action === 'fetch_users') {
      var userSheet = getOrCreateUserSheet(ss);
      var usersList = parseUserRowsFromSheet(userSheet);
      return jsonResponse({
        success: true,
        version: SCRIPT_VERSION,
        count: usersList.length,
        users: usersList
      });
    }

    // 1. 連線測試 ping
    if (action === 'ping') {
      var claimSheet = getOrCreateClaimSheet(ss);
      var userSheet = getOrCreateUserSheet(ss);
      return jsonResponse({
        success: true,
        version: SCRIPT_VERSION,
        message: '連線成功！Google Apps Script 雙模組就緒 (版本: ' + SCRIPT_VERSION + ')',
        spreadsheet_name: ss.getName(),
        claims_rows: Math.max(0, claimSheet.getLastRow() - 1),
        users_rows: Math.max(0, userSheet.getLastRow() - 1),
        user_headers: USER_HEADERS
      });
    }

    // 2. 人員權限：單筆新增或更新 (sync_user)
    if (action === 'sync_user' || action === 'append_user') {
      var userSheet = getOrCreateUserSheet(ss);
      var user = payload.user || payload;
      var result = upsertUserRow(userSheet, user);
      return jsonResponse({
        success: true,
        message: '同仁帳號 [' + (user.name || user.username) + '] 權限資料已成功同步至試算表',
        action_performed: result.action,
        row: result.row
      });
    }

    // 3. 人員權限：全量覆寫 / 同步所有同仁名冊 (sync_all_users)
    if (action === 'sync_all_users') {
      var userSheet = getOrCreateUserSheet(ss);
      var users = payload.users || [];
      userSheet.clearContents();
      userSheet.appendRow(USER_HEADERS);
      formatUserHeaderRow(userSheet);

      var userRows = [];
      for (var u = 0; u < users.length; u++) {
        userRows.push(formatUserRow(users[u]));
      }

      if (userRows.length > 0) {
        userSheet.getRange(2, 1, userRows.length, USER_HEADERS.length).setValues(userRows);
        for (var r = 2; r <= userRows.length + 1; r++) {
          formatUserDataRow(userSheet, r);
        }
      }

      return jsonResponse({
        success: true,
        message: '全量同步完成，共更新 ' + users.length + ' 筆同仁權限名冊至試算表',
        count: users.length
      });
    }

    // 4. 報銷單據：新增單筆申請 (append)
    if (action === 'append') {
      var claimSheet = getOrCreateClaimSheet(ss);
      var claim = payload.claim || payload;
      var photoUrl = claim.receipt_url || '';

      if (payload.photo_base64) {
        photoUrl = savePhotoToDrive(claim.claim_no, payload.photo_base64, payload.photo_filename);
      }

      var rowData = formatClaimRow(claim, photoUrl);
      claimSheet.appendRow(rowData);
      
      var lastRow = claimSheet.getLastRow();
      formatClaimDataRow(claimSheet, lastRow);

      return jsonResponse({
        success: true,
        message: '申請單 ' + claim.claim_no + ' 已成功同步至 Google 試算表',
        claim_no: claim.claim_no,
        photo_url: photoUrl
      });
    }

    // 5. 報銷單據：全量同步 (sync_all)
    if (action === 'sync_all') {
      var claimSheet = getOrCreateClaimSheet(ss);
      var claims = payload.claims || [];
      claimSheet.clearContents();
      
      claimSheet.appendRow(CLAIM_HEADERS);
      formatClaimHeaderRow(claimSheet);

      var rows = [];
      for (var i = 0; i < claims.length; i++) {
        var c = claims[i];
        rows.push(formatClaimRow(c, c.receipt_url || ''));
      }

      if (rows.length > 0) {
        claimSheet.getRange(2, 1, rows.length, CLAIM_HEADERS.length).setValues(rows);
        for (var cr = 2; cr <= rows.length + 1; cr++) {
          formatClaimDataRow(claimSheet, cr);
        }
      }

      return jsonResponse({
        success: true,
        message: '全量同步完成，共更新 ' + claims.length + ' 筆單據紀錄至 Google 試算表',
        count: claims.length
      });
    }

    return jsonResponse({ success: false, message: '未知的操作指令: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString(), message: '處理失敗: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 工作表管理與格式化
// ==========================================

function getOrCreateClaimSheet(ss) {
  var sheet = ss.getSheetByName(CLAIMS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CLAIMS_SHEET_NAME);
    sheet.appendRow(CLAIM_HEADERS);
    formatClaimHeaderRow(sheet);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(CLAIM_HEADERS);
    formatClaimHeaderRow(sheet);
  }
  return sheet;
}

function getOrCreateUserSheet(ss) {
  var sheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USER_SHEET_NAME);
    sheet.appendRow(USER_HEADERS);
    formatUserHeaderRow(sheet);
  } else {
    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      sheet.appendRow(USER_HEADERS);
      formatUserHeaderRow(sheet);
    } else {
      // 檢查既有工作表第 1 列是否包含「登入密碼」
      var lastCol = Math.max(sheet.getLastColumn(), USER_HEADERS.length);
      var firstRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      if (firstRow[2] !== '登入密碼') {
        // 若第 3 欄不是登入密碼，自動將第 1 列重設為最新 USER_HEADERS (含登入密碼)
        sheet.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]);
        formatUserHeaderRow(sheet);
      }
    }
  }
  return sheet;
}

function formatClaimHeaderRow(sheet) {
  var range = sheet.getRange(1, 1, 1, CLAIM_HEADERS.length);
  range.setBackground('#1e3a8a') // 深藍色
       .setFontColor('#ffffff')
       .setFontWeight('bold')
       .setHorizontalAlignment('center')
       .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);
}

function formatUserHeaderRow(sheet) {
  var range = sheet.getRange(1, 1, 1, USER_HEADERS.length);
  range.setBackground('#065f46') // 翡翠深綠色
       .setFontColor('#ffffff')
       .setFontWeight('bold')
       .setHorizontalAlignment('center')
       .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);
}

function formatClaimDataRow(sheet, rowNum) {
  sheet.setRowHeight(rowNum, 30);
  sheet.getRange(rowNum, 1, 1, CLAIM_HEADERS.length).setVerticalAlignment('middle');
  sheet.getRange(rowNum, 8).setHorizontalAlignment('right').setNumberFormat('$#,##0');
  sheet.getRange(rowNum, 3).setHorizontalAlignment('center');
  sheet.getRange(rowNum, 11).setHorizontalAlignment('center');
}

function formatUserDataRow(sheet, rowNum) {
  sheet.setRowHeight(rowNum, 30);
  sheet.getRange(rowNum, 1, 1, USER_HEADERS.length).setVerticalAlignment('middle');
  sheet.getRange(rowNum, 2).setHorizontalAlignment('center'); // 帳號
  sheet.getRange(rowNum, 3).setHorizontalAlignment('center'); // 登入密碼
  sheet.getRange(rowNum, 6).setHorizontalAlignment('center'); // 角色
  sheet.getRange(rowNum, 7).setHorizontalAlignment('center'); // 狀態
  sheet.getRange(rowNum, 9).setHorizontalAlignment('center'); // 時間
}

// 整理人員權限單筆資料列
function formatUserRow(u) {
  var roleText = {
    employee: '一般員工',
    accountant: '會計人員',
    admin: '超級使用者'
  }[u.role] || u.role;

  var statusText = {
    pending: '⏳ 待主管審核',
    approved: '✓ 已核准啟用',
    rejected: '✕ 已駁回'
  }[u.status] || u.status;

  var pwd = u.password || u.plain_password || '-';

  return [
    u.id || ('usr_' + (u.username || '')),
    u.username || '',
    pwd,
    u.name || '',
    u.department || '未分配',
    roleText,
    statusText,
    u.apply_reason || u.reason || '系統核心帳號',
    u.created_at ? new Date(u.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '',
    u.reviewer_name || (u.status === 'approved' ? '系統管理者' : '-'),
    u.reviewed_at ? new Date(u.reviewed_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : (u.status === 'approved' ? '系統初始化' : '-'),
    u.review_note || '-'
  ];
}

// 新增或更新人員列 (依據 username 比對)
function upsertUserRow(sheet, user) {
  var lastRow = sheet.getLastRow();
  var rowData = formatUserRow(user);
  var targetUsername = String(user.username || '').trim().toLowerCase();

  if (lastRow >= 2 && targetUsername) {
    // 讀取所有現有帳號 (第 2 欄)
    var usernames = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (var i = 0; i < usernames.length; i++) {
      var existUser = String(usernames[i][0]).trim().toLowerCase();
      if (existUser === targetUsername) {
        var rowIndex = i + 2;
        sheet.getRange(rowIndex, 1, 1, USER_HEADERS.length).setValues([rowData]);
        formatUserDataRow(sheet, rowIndex);
        return { action: 'updated', row: rowIndex };
      }
    }
  }

  sheet.appendRow(rowData);
  var newRow = sheet.getLastRow();
  formatUserDataRow(sheet, newRow);
  return { action: 'inserted', row: newRow };
}

// 整理單筆報銷資料陣列
function formatClaimRow(c, photoUrl) {
  var photoCell = '-';
  if (photoUrl && photoUrl.indexOf('http') === 0) {
    photoCell = '=HYPERLINK("' + photoUrl + '", "🔗 查看發票憑證")';
  } else if (photoUrl) {
    photoCell = photoUrl;
  }

  var statusText = c.status;
  if (c.status === 'pending') statusText = '待初審';
  if (c.status === 'acc_approved') statusText = '待主管終審(會計已核)';
  if (c.status === 'approved') statusText = '主管已核准';
  if (c.status === 'disbursed') statusText = '已撥款核銷';
  if (c.status === 'rejected') statusText = '已退回';

  return [
    c.claim_no || '',
    c.created_at ? new Date(c.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '',
    c.expense_date || '',
    c.user_name || '',
    c.department || '',
    c.category || '',
    c.item_name || '',
    Number(c.amount) || 0,
    c.receipt_no || '-',
    c.notes || '-',
    statusText,
    c.updated_at ? new Date(c.updated_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '',
    photoCell
  ];
}

// 將 Base64 圖片儲存到 Google Drive 雲端資料夾並取得公開檢視網址
function savePhotoToDrive(claimNo, base64String, fileName) {
  try {
    var targetFolder = null;
    if (typeof FOLDER_ID !== 'undefined' && FOLDER_ID && FOLDER_ID.trim() !== '') {
      try {
        targetFolder = DriveApp.getFolderById(FOLDER_ID.trim());
      } catch (fErr) {
        console.warn('無法透過 ID 取得資料夾，將改以名稱搜尋或建立: ' + fErr.message);
      }
    }

    if (!targetFolder) {
      var folders = DriveApp.getFoldersByName(FOLDER_NAME);
      targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);
    }

    var cleanBase64 = base64String;
    var contentType = 'image/jpeg';
    if (base64String.indexOf('data:') === 0) {
      var parts = base64String.split(',');
      var mimeMatch = parts[0].match(/:(.*?);/);
      if (mimeMatch) contentType = mimeMatch[1];
      cleanBase64 = parts[1];
    }

    var ext = contentType.indexOf('png') !== -1 ? 'png' : 'jpg';
    var name = (fileName || (claimNo + '_發票憑證_' + new Date().getTime())) + '.' + ext;
    var decoded = Utilities.base64Decode(cleanBase64);
    var blob = Utilities.newBlob(decoded, contentType, name);
    var file = targetFolder.createFile(blob);
    
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    return '上傳失敗: ' + err.message;
  }
}

// JSON 回傳封裝
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 動態解析試算表上的所有人員名冊資料列 (自適應欄位排列與舊版相容)
function parseUserRowsFromSheet(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sheet.getLastColumn();
  if (lastCol < 2) return [];

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function(h) { return String(h || '').trim(); });

  // 動態比對標題定位
  var idIdx = -1, usernameIdx = -1, passwordIdx = -1, nameIdx = -1, deptIdx = -1, roleIdx = -1, statusIdx = -1;

  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h.indexOf('序號') !== -1 || h.toLowerCase() === 'id') idIdx = c;
    else if (h.indexOf('帳號') !== -1 || h.toLowerCase().indexOf('username') !== -1) usernameIdx = c;
    else if (h.indexOf('密碼') !== -1 || h.toLowerCase().indexOf('password') !== -1) passwordIdx = c;
    else if (h.indexOf('姓名') !== -1 || h.toLowerCase().indexOf('name') !== -1) nameIdx = c;
    else if (h.indexOf('部門') !== -1 || h.toLowerCase().indexOf('dept') !== -1) deptIdx = c;
    else if (h.indexOf('角色') !== -1 || h.indexOf('權限') !== -1 || h.toLowerCase().indexOf('role') !== -1) roleIdx = c;
    else if (h.indexOf('狀態') !== -1 || h.toLowerCase().indexOf('status') !== -1) statusIdx = c;
  }

  // 預設位置 (若無標題匹配)
  if (usernameIdx === -1) usernameIdx = 1;
  if (passwordIdx === -1 && headers.length >= 12) passwordIdx = 2; // 新版第 3 欄
  if (nameIdx === -1) nameIdx = (passwordIdx === 2 ? 3 : 2);
  if (deptIdx === -1) deptIdx = (passwordIdx === 2 ? 4 : 3);
  if (roleIdx === -1) roleIdx = (passwordIdx === 2 ? 5 : 4);
  if (statusIdx === -1) statusIdx = (passwordIdx === 2 ? 6 : 5);

  var list = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var username = String(row[usernameIdx] || '').trim();
    if (!username) continue;

    var rawPwd = (passwordIdx !== -1 && row[passwordIdx] !== undefined) ? String(row[passwordIdx]).trim() : '';
    var rawName = (nameIdx !== -1 && row[nameIdx] !== undefined) ? String(row[nameIdx]).trim() : username;
    var rawDept = (deptIdx !== -1 && row[deptIdx] !== undefined) ? String(row[deptIdx]).trim() : '一般同仁';
    var rawRole = (roleIdx !== -1 && row[roleIdx] !== undefined) ? String(row[roleIdx]).trim() : 'employee';
    var rawStatus = (statusIdx !== -1 && row[statusIdx] !== undefined) ? String(row[statusIdx]).trim() : 'approved';

    // 角色代碼轉換
    var roleCode = 'employee';
    var roleStr = rawRole.toLowerCase();
    if (roleStr.indexOf('超級') !== -1 || roleStr.indexOf('admin') !== -1 || roleStr.indexOf('總監') !== -1 || roleStr.indexOf('管理') !== -1) {
      roleCode = 'admin';
    } else if (roleStr.indexOf('會計') !== -1 || roleStr.indexOf('財務') !== -1 || roleStr.indexOf('acc') !== -1 || roleStr.indexOf('出納') !== -1) {
      roleCode = 'accountant';
    }

    // 狀態代碼轉換
    var statusCode = 'approved';
    var statusStr = rawStatus.toLowerCase();
    if (statusStr.indexOf('待') !== -1 || statusStr.indexOf('審核') !== -1 || statusStr.indexOf('pending') !== -1 || statusStr.indexOf('⏳') !== -1) {
      statusCode = 'pending';
    } else if (statusStr.indexOf('駁回') !== -1 || statusStr.indexOf('退回') !== -1 || statusStr.indexOf('停用') !== -1 || statusStr.indexOf('rejected') !== -1 || statusStr.indexOf('✕') !== -1) {
      statusCode = 'rejected';
    }

    list.push({
      id: (idIdx !== -1 && row[idIdx]) ? String(row[idIdx]) : ('usr_' + username),
      username: username,
      password: rawPwd,
      name: rawName,
      department: rawDept,
      role: roleCode,
      raw_role: rawRole,
      status: statusCode,
      raw_status: rawStatus
    });
  }

  return list;
}
