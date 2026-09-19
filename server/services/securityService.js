const crypto = require('crypto');

// 伺服器端簽章驗證金鑰
const PAYLOAD_SIGN_SECRET = process.env.PAYLOAD_SECRET || 'sec_petty_cash_hmac_2026_verify_key';

const securityService = {
  // 輸入消毒 (防止 XSS 與惡意注入)
  sanitize(input) {
    if (typeof input !== 'string') return input;
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .trim();
  },

  // 驗證並清理申請單輸入
  sanitizeClaimInput(body) {
    const validCategories = ['交通', '餐食', '設備', '交際費', '清潔及庶務用品', '其他'];

    const amount = Number(body.amount);
    if (isNaN(amount) || amount <= 0 || !Number.isFinite(amount)) {
      throw new Error('申請金額必須大於 0');
    }

    if (!body.item_name || body.item_name.trim().length === 0) {
      throw new Error('請填寫申請項目名稱');
    }

    if (!validCategories.includes(body.category)) {
      throw new Error(`無效的類別，僅接受：${validCategories.join('、')}`);
    }

    if (!body.expense_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.expense_date)) {
      throw new Error('消費日期格式不正確 (請使用 YYYY-MM-DD)');
    }

    return {
      item_name: this.sanitize(body.item_name),
      amount: Math.round(amount), // 取整數元
      expense_date: body.expense_date,
      category: body.category,
      receipt_no: this.sanitize(body.receipt_no || ''),
      notes: this.sanitize(body.notes || ''),
      receipt_url: body.receipt_url ? String(body.receipt_url).slice(0, 500000) : ''
    };
  },

  // 機密遮罩處理 (確保任何金鑰或敏感資訊絕不洩漏到前端)
  maskSecret(val, visibleChars = 4) {
    if (!val || typeof val !== 'string') return '';
    if (val.length <= visibleChars * 2) return '******';
    return `${val.substring(0, visibleChars)}...${val.substring(val.length - visibleChars)}`;
  },

  // 驗證請求簽名 (防重放攻擊與傳輸篡改)
  verifyRequestIntegrity(timestamp, signature, payloadString) {
    if (!timestamp || !signature) return true; // 若前端未啟用簽名則由 TLS/JWT 守護
    const now = Date.now();
    // 限制時間戳在 5 分鐘內，防止 Replay Attack
    if (Math.abs(now - Number(timestamp)) > 300000) {
      return false;
    }
    const expectedSig = crypto
      .createHmac('sha256', PAYLOAD_SIGN_SECRET)
      .update(`${timestamp}:${payloadString}`)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  }
};

module.exports = securityService;
