const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const db = require('../db');
const securityService = require('./securityService');

const UPLOADS_DIR = path.join(__dirname, '../../data/uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

class GoogleDriveService {
  // 取得 Drive 設定
  getConfig() {
    const dbConfig = db.getConfig();
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || dbConfig.google_service_account_email || '';
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || dbConfig.google_private_key || '';
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || dbConfig.google_drive_folder_id || '';

    if (privateKey && privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const isConfigured = Boolean(email && privateKey && folderId);
    return { isConfigured, email, privateKey, folderId };
  }

  // 取得 Drive Auth Client
  getDriveClient() {
    const config = this.getConfig();
    if (!config.isConfigured) {
      throw new Error('Google Drive 尚未設定服務帳戶或雲端資料夾 ID');
    }

    const auth = new google.auth.JWT(
      config.email,
      null,
      config.privateKey,
      ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
    );

    return { drive: google.drive({ version: 'v3', auth }), folderId: config.folderId };
  }

  /**
   * 上傳發票/憑證照片
   * 優先上傳至指定 Google Drive 雲端資料夾；
   * 若尚未設定 Drive 金鑰，則自動保存至本機 data/uploads/ 資料夾，確保功能 100% 正常運作。
   */
  async uploadReceipt(claimNo, base64Data, originalFileName = '') {
    if (!base64Data || typeof base64Data !== 'string') return '';
    
    // 如果已經是外部 URL 且非 base64，直接返回
    if (base64Data.startsWith('http://') || base64Data.startsWith('https://')) {
      return base64Data;
    }

    // 解析 Base64
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let mimeType = 'image/jpeg';
    let buffer;

    if (matches && matches.length === 3) {
      mimeType = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(base64Data, 'base64');
    }

    const ext = mimeType.split('/')[1] || 'png';
    const cleanFileName = `${claimNo}_receipt_${Date.now()}.${ext}`;

    // 1. 本地備份儲存 (供 Excel 報表內嵌縮圖讀取)
    const localFilePath = path.join(UPLOADS_DIR, cleanFileName);
    fs.writeFileSync(localFilePath, buffer);
    const localUrl = `/uploads/${cleanFileName}`;

    // 2. 嘗試上傳到 Google Drive 雲端資料夾
    const config = this.getConfig();
    if (config.isConfigured) {
      try {
        const { drive, folderId } = this.getDriveClient();
        const { Readable } = require('stream');
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        const driveFile = await drive.files.create({
          requestBody: {
            name: cleanFileName,
            parents: [folderId],
            description: `零用金申請單 ${claimNo} 之發票憑證照片`
          },
          media: {
            mimeType,
            body: stream
          },
          fields: 'id, webViewLink, webContentLink'
        });

        // 開放權限為任何人可讀 (便於會計檢視與試算表直接連結)
        try {
          await drive.permissions.create({
            fileId: driveFile.data.id,
            requestBody: {
              role: 'reader',
              type: 'anyone'
            }
          });
        } catch (permErr) {
          console.warn('Google Drive set permission notice:', permErr.message);
        }

        const driveViewLink = driveFile.data.webViewLink || `https://drive.google.com/file/d/${driveFile.data.id}/view`;
        console.log(`[DRIVE-SUCCESS] 憑證照片已上傳至 Google Drive 雲端資料夾: ${driveViewLink}`);
        return driveViewLink;
      } catch (err) {
        console.warn(`[DRIVE-FALLBACK] Google Drive 上傳失敗 (${err.message})，自動改用本機安全儲存: ${localUrl}`);
        return localUrl;
      }
    }

    // 未配置 Google Drive 則返回本地檔案存取網址
    return localUrl;
  }

  // 取得本機實體檔案路徑 (供 ExcelJS 嵌入圖片使用)
  getLocalFilePathFromUrl(receiptUrl) {
    if (!receiptUrl) return null;
    if (receiptUrl.startsWith('/uploads/')) {
      const fileName = path.basename(receiptUrl);
      const fullPath = path.join(UPLOADS_DIR, fileName);
      return fs.existsSync(fullPath) ? fullPath : null;
    }
    return null;
  }
}

module.exports = new GoogleDriveService();
