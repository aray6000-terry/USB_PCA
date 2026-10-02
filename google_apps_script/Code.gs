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

  // 支援 API 查詢全部零用金申請單據
  if (e && e.parameter && (e.parameter.action === 'get_claims' || e.parameter.action === 'fetch_claims')) {
    var claimSheet = getOrCreateClaimSheet(ss);
    var claimsList = parseClaimRowsFromSheet(claimSheet);
    return jsonResponse({
      success: true,
      version: SCRIPT_VERSION,
      count: claimsList.length,
      claims: claimsList
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

    // 0-1. 即時讀取試算表上所有零用金單據 (供雙向拉取同步)
    if (action === 'get_claims' || action === 'fetch_claims') {
      var claimSheet = getOrCreateClaimSheet(ss);
      var claimsList = parseClaimRowsFromSheet(claimSheet);
      return jsonResponse({
        success: true,
        version: SCRIPT_VERSION,
        count: claimsList.length,
        claims: claimsList
      });
    }

    // 0-2. 雲端 AI 發票辨識中轉 (支援 OpenAI ChatGPT / Google Gemini，免去瀏覽器跨域限制)
    if (action === 'recognize_receipt') {
      var imgData = payload.image_data || '';
      var oaiKey = payload.openai_api_key || '';
      var gemKey = payload.gemini_api_key || '';
      var ocrResult = gasAiReceiptOcr(imgData, oaiKey, gemKey);
      return jsonResponse(ocrResult);
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

    // 6. 報銷單據：更新或重新上傳發票憑證 (update_receipt)
    if (action === 'update_receipt' || action === 'upload_receipt') {
      var claimSheet = getOrCreateClaimSheet(ss);
      var claimNo = String(payload.claim_no || '').trim();
      var photoUrl = payload.receipt_url || '';

      if (payload.photo_base64) {
        var driveUrl = savePhotoToDrive(claimNo, payload.photo_base64, payload.photo_filename);
        if (driveUrl) {
          photoUrl = driveUrl;
        }
      }

      var lastRow = claimSheet.getLastRow();
      var updatedRow = -1;
      if (lastRow >= 2 && claimNo) {
        var headerRange = claimSheet.getRange(1, 1, 1, claimSheet.getLastColumn()).getValues()[0];
        var claimNoCol = -1;
        var receiptUrlCol = -1;
        for (var c = 0; c < headerRange.length; c++) {
          var h = String(headerRange[c] || '').trim();
          if (h.indexOf('單號') !== -1) claimNoCol = c + 1;
          if (h.indexOf('憑證') !== -1 || h.indexOf('照片') !== -1 || h.indexOf('網址') !== -1) receiptUrlCol = c + 1;
        }
        if (claimNoCol !== -1 && receiptUrlCol !== -1) {
          var dataVals = claimSheet.getRange(2, claimNoCol, lastRow - 1, 1).getValues();
          for (var r = 0; r < dataVals.length; r++) {
            if (String(dataVals[r][0] || '').trim().toLowerCase() === claimNo.toLowerCase()) {
              claimSheet.getRange(r + 2, receiptUrlCol).setValue(photoUrl);
              updatedRow = r + 2;
              break;
            }
          }
        }
      }

      return jsonResponse({
        success: true,
        message: '申請單 ' + claimNo + ' 之發票憑證照片已成功更新至 Google 試算表！',
        claim_no: claimNo,
        receipt_url: photoUrl,
        sheet_row: updatedRow
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

// 動態解析試算表上的所有申請單據資料列
function parseClaimRowsFromSheet(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sheet.getLastColumn();
  if (lastCol < 2) return [];

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function(h) { return String(h || '').trim(); });

  var claimNoIdx = -1, createdAtIdx = -1, dateIdx = -1, nameIdx = -1, deptIdx = -1,
      catIdx = -1, itemIdx = -1, amountIdx = -1, receiptNoIdx = -1, notesIdx = -1,
      statusIdx = -1, updatedAtIdx = -1, receiptUrlIdx = -1;

  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h.indexOf('單號') !== -1) claimNoIdx = c;
    else if (h.indexOf('申請時間') !== -1) createdAtIdx = c;
    else if (h.indexOf('消費日期') !== -1 || h.indexOf('日期') !== -1) dateIdx = c;
    else if (h.indexOf('申請人') !== -1 || h.indexOf('同仁') !== -1) nameIdx = c;
    else if (h.indexOf('部門') !== -1) deptIdx = c;
    else if (h.indexOf('類別') !== -1) catIdx = c;
    else if (h.indexOf('項目') !== -1) itemIdx = c;
    else if (h.indexOf('金額') !== -1) amountIdx = c;
    else if (h.indexOf('發票') !== -1 && h.indexOf('號碼') !== -1) receiptNoIdx = c;
    else if (h.indexOf('備註') !== -1) notesIdx = c;
    else if (h.indexOf('狀態') !== -1) statusIdx = c;
    else if (h.indexOf('更新') !== -1) updatedAtIdx = c;
    else if (h.indexOf('憑證') !== -1 || h.indexOf('相片') !== -1 || h.indexOf('Drive') !== -1) receiptUrlIdx = c;
  }

  if (claimNoIdx === -1) claimNoIdx = 0;
  if (createdAtIdx === -1) createdAtIdx = 1;
  if (dateIdx === -1) dateIdx = 2;
  if (nameIdx === -1) nameIdx = 3;
  if (deptIdx === -1) deptIdx = 4;
  if (catIdx === -1) catIdx = 5;
  if (itemIdx === -1) itemIdx = 6;
  if (amountIdx === -1) amountIdx = 7;
  if (receiptNoIdx === -1) receiptNoIdx = 8;
  if (notesIdx === -1) notesIdx = 9;
  if (statusIdx === -1) statusIdx = 10;
  if (updatedAtIdx === -1) updatedAtIdx = 11;
  if (receiptUrlIdx === -1) receiptUrlIdx = 12;

  var list = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var claimNo = String(row[claimNoIdx] || '').trim();
    if (!claimNo) continue;

    var rawAmount = Number(String(row[amountIdx] || '').replace(/[^0-9.-]+/g, '')) || 0;
    var rawStatus = String(row[statusIdx] || '').trim();
    var statusCode = 'pending';
    if (rawStatus.indexOf('核銷') !== -1 || rawStatus.indexOf('撥款') !== -1 || rawStatus.toLowerCase().indexOf('disbursed') !== -1) {
      statusCode = 'disbursed';
    } else if (rawStatus.indexOf('核准') !== -1 || rawStatus.toLowerCase().indexOf('approved') !== -1) {
      statusCode = 'approved';
    } else if (rawStatus.indexOf('初審') !== -1 || rawStatus.indexOf('會計') !== -1) {
      statusCode = 'acc_approved';
    } else if (rawStatus.indexOf('退回') !== -1 || rawStatus.indexOf('拒絕') !== -1 || rawStatus.toLowerCase().indexOf('rejected') !== -1) {
      statusCode = 'rejected';
    }

    var expenseDateStr = '';
    if (row[dateIdx] instanceof Date) {
      expenseDateStr = Utilities.formatDate(row[dateIdx], 'Asia/Taipei', 'yyyy-MM-dd');
    } else {
      expenseDateStr = String(row[dateIdx] || '').trim();
    }

    list.push({
      id: 'clm_sheet_r' + (r + 1) + '_' + claimNo.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
      sheet_row: r + 1,
      claim_no: claimNo,
      expense_date: expenseDateStr,
      user_name: String(row[nameIdx] || '同仁').trim(),
      department: String(row[deptIdx] || '一般部門').trim(),
      category: String(row[catIdx] || '其他').trim(),
      item_name: String(row[itemIdx] || '').trim(),
      amount: rawAmount,
      receipt_no: String(row[receiptNoIdx] || '').trim(),
      notes: String(row[notesIdx] || '').trim(),
      status: statusCode,
      raw_status: rawStatus,
      receipt_url: String(row[receiptUrlIdx] || '').trim(),
      created_at: String(row[createdAtIdx] || new Date().toISOString()),
      sheet_synced: true
    });
  }

  return list;
}

// ==========================================
// Google Drive 發票憑證圖檔儲存模組
// ==========================================

function savePhotoToDrive(claimNo, base64Data, filename) {
  if (!base64Data || typeof base64Data !== 'string') return '';
  try {
    var folderName = '零用金發票憑證';
    var folders = DriveApp.getFoldersByName(folderName);
    var targetFolder = null;
    if (folders.hasNext()) {
      targetFolder = folders.next();
    } else {
      targetFolder = DriveApp.createFolder(folderName);
      targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    var cleanBase64 = base64Data;
    var mimeType = 'image/jpeg';
    if (base64Data.indexOf(';base64,') !== -1) {
      var parts = base64Data.split(';base64,');
      mimeType = parts[0].replace('data:', '') || 'image/jpeg';
      cleanBase64 = parts[1];
    }

    var ext = 'jpg';
    if (mimeType.indexOf('png') !== -1) ext = 'png';
    else if (mimeType.indexOf('gif') !== -1) ext = 'gif';
    else if (mimeType.indexOf('webp') !== -1) ext = 'webp';

    var fileTitle = (claimNo ? claimNo + '_' : '') + 'receipt_' + Date.now() + '.' + ext;
    var decoded = Utilities.base64Decode(cleanBase64);
    var blob = Utilities.newBlob(decoded, mimeType, fileTitle);

    var file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 回傳 Google Drive 直連預覽網址
    return file.getUrl();
  } catch (err) {
    Logger.log('儲存相片至 Google Drive 失敗: ' + err.toString());
    return '';
  }
}

/**
 * Google Apps Script 雲端 AI 發票收據視覺辨識
 * 支援 OpenAI ChatGPT (GPT-4o-mini) 與 Google Gemini 多模態中轉
 */
function gasAiReceiptOcr(imageBase64, openAiKey, geminiKey) {
  if (!imageBase64) {
    return { success: false, message: '未提供圖片資料' };
  }

  var prompt = '你是一個專業的台灣企業財務與會計發票收據自動辨識專家。請從發票照片中辨識繁體中文資訊，嚴格輸出 JSON 格式：\n'
    + '{\n'
    + '  "receipts": [\n'
    + '    {\n'
    + '      "expense_date": "YYYY-MM-DD",\n'
    + '      "category": "交通 | 餐食 | 設備 | 交際費 | 清潔及庶務用品 | 其他",\n'
    + '      "item_name": "消費名目項目說明",\n'
    + '      "amount": 450,\n'
    + '      "receipt_no": "統一發票號碼如 AB-12345678",\n'
    + '      "notes": "店家名稱與統編"\n'
    + '    }\n'
    + '  ]\n'
    + '}';

  // 1. 若有配置 OpenAI API Key (sk-...)
  if (openAiKey && openAiKey.indexOf('sk-') === 0) {
    try {
      var oaiPayload = {
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are an AI specialized in Taiwanese invoice OCR. Output valid JSON only.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageBase64 } }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      };

      var oaiOptions = {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + openAiKey.trim() },
        payload: JSON.stringify(oaiPayload),
        muteHttpExceptions: true
      };

      var oaiRes = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', oaiOptions);
      var oaiCode = oaiRes.getResponseCode();
      if (oaiCode === 200) {
        var oaiJson = JSON.parse(oaiRes.getContentText());
        var oaiTxt = oaiJson.choices && oaiJson.choices[0] && oaiJson.choices[0].message && oaiJson.choices[0].message.content;
        if (oaiTxt) {
          var parsedData = JSON.parse(oaiTxt);
          return {
            success: true,
            source: 'chatgpt_vision',
            message: 'ChatGPT 成功辨識出發票明細！',
            receipts: parsedData.receipts || []
          };
        }
      } else {
        Logger.log('OpenAI API 回傳 HTTP ' + oaiCode + ': ' + oaiRes.getContentText());
      }
    } catch (e) {
      Logger.log('GAS OpenAI 辨識異常: ' + e.toString());
    }
  }

  // 2. 若有配置 Gemini API Key
  if (geminiKey) {
    try {
      var mimeType = 'image/jpeg';
      var rawBase64 = imageBase64;
      var matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        rawBase64 = matches[2];
      }

      var gemUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + geminiKey.trim();
      var gemPayload = {
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: rawBase64 } }
          ]
        }],
        generationConfig: { response_mime_type: 'application/json', temperature: 0.1 }
      };

      var gemOptions = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(gemPayload),
        muteHttpExceptions: true
      };

      var gemRes = UrlFetchApp.fetch(gemUrl, gemOptions);
      if (gemRes.getResponseCode() === 200) {
        var gemJson = JSON.parse(gemRes.getContentText());
        var gemTxt = gemJson.candidates && gemJson.candidates[0] && gemJson.candidates[0].content && gemJson.candidates[0].content.parts && gemJson.candidates[0].content.parts[0] && gemJson.candidates[0].content.parts[0].text;
        if (gemTxt) {
          var parsedGem = JSON.parse(gemTxt);
          return {
            success: true,
            source: 'gemini_vision',
            message: 'Gemini 成功辨識出發票明細！',
            receipts: parsedGem.receipts || []
          };
        }
      }
    } catch (err) {
      Logger.log('GAS Gemini 辨識異常: ' + err.toString());
    }
  }

  return {
    success: false,
    message: '未能完成 AI 發票辨識，請確認是否已正確設定 OpenAI 或 Gemini API Key。'
  };
}
