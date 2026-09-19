const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '../../data/logs');
const LOG_FILE = path.join(LOGS_DIR, 'approval_changes.log');

// 確保 data/logs 目錄存在
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * 格式化時間戳記 (本地台北時間)
 */
function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * 貨幣格式化輔助函數
 */
function formatAmount(val) {
  const num = Number(val) || 0;
  return `NT$ ${num.toLocaleString('en-US')}`;
}

const auditLogService = {
  /**
   * 寫入批准金額變更與審核動作至實體 Log 檔 (approval_changes.log)
   * 
   * @param {Object} params
   * @param {Object} params.claim 原始單據資料
   * @param {Object} params.user 執行操作的使用者 (req.user)
   * @param {number} params.oldApprovedAmount 變更前之核准金額 (或原申報金額)
   * @param {number} params.newApprovedAmount 變更後之新核准金額
   * @param {string} params.action 操作類型 (例如: 審核通過, 調整核准金額, 完成撥款核銷)
   * @param {string} params.reason 審核意見或修改原因備註
   * @param {string} params.ip 來源 IP
   */
  logApprovalChange({ claim, user, oldApprovedAmount, newApprovedAmount, action = '審核通過', reason = '', ip = '' }) {
    const timestamp = getTimestamp();
    const claimAmount = Number(claim.amount) || 0;
    const oldAmt = Number(oldApprovedAmount !== undefined && oldApprovedAmount !== null ? oldApprovedAmount : claimAmount);
    const newAmt = Number(newApprovedAmount !== undefined && newApprovedAmount !== null ? newApprovedAmount : claimAmount);
    const diff = newAmt - claimAmount;
    const diffText = diff === 0 ? '全額核准 (無差額)' : (diff > 0 ? `+${diff.toLocaleString('en-US')}` : `${diff.toLocaleString('en-US')}`);

    // 單行日誌格式（便於文字分析工具/grep 檢索）
    const logLine = `[${timestamp}] [AMOUNT_ACTION] 單號: ${claim.claim_no} | 操作人: ${user.name} (${user.role}/${user.username}) | 動作: ${action} | 申報金額: ${formatAmount(claimAmount)} | 原核准: ${formatAmount(oldAmt)} -> 新核准: ${formatAmount(newAmt)} | 差額: ${diffText} | 備註: ${reason || '無'} | 申請人: ${claim.user_name} | IP: ${ip || '本地'}\n`;

    try {
      fs.appendFileSync(LOG_FILE, logLine, 'utf8');
    } catch (err) {
      console.error('[auditLogService] 寫入實體 Log 檔失敗:', err);
    }

    return {
      timestamp,
      claim_no: claim.claim_no,
      user_name: user.name,
      user_role: user.role,
      action,
      claim_amount: claimAmount,
      old_approved_amount: oldAmt,
      new_approved_amount: newAmt,
      diff,
      reason: reason || '無',
      raw_line: logLine.trim()
    };
  },

  /**
   * 讀取最近的 Log 紀錄 (預設最新 100 筆，倒序回傳)
   */
  getRecentLogs(limit = 100) {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }

    try {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      
      // 倒序排列（最新在前）
      const recentLines = lines.slice(-limit).reverse();

      return recentLines.map((line, index) => {
        const matchTime = line.match(/^\[(.*?)\]/);
        const timestamp = matchTime ? matchTime[1] : '';

        const getPart = (key) => {
          const reg = new RegExp(`${key}:\\s*([^|]+)`);
          const m = line.match(reg);
          return m ? m[1].trim() : '';
        };

        return {
          id: `log-${Date.now()}-${index}`,
          raw: line,
          timestamp,
          claim_no: getPart('單號'),
          operator: getPart('操作人'),
          action: getPart('動作'),
          claim_amount: getPart('申報金額'),
          amount_change: getPart('原核准'),
          diff: getPart('差額'),
          reason: getPart('備註'),
          applicant: getPart('申請人'),
          ip: getPart('IP')
        };
      });
    } catch (err) {
      console.error('[auditLogService] 讀取 Log 檔失敗:', err);
      return [];
    }
  },

  /**
   * 取得 Log 檔案實體路徑與狀態資訊
   */
  getLogFileInfo() {
    const exists = fs.existsSync(LOG_FILE);
    let sizeBytes = 0;
    let modifiedAt = null;

    if (exists) {
      const stat = fs.statSync(LOG_FILE);
      sizeBytes = stat.size;
      modifiedAt = stat.mtime;
    }

    return {
      filePath: LOG_FILE,
      fileName: 'approval_changes.log',
      exists,
      sizeBytes,
      sizeFormatted: `${(sizeBytes / 1024).toFixed(2)} KB`,
      modifiedAt
    };
  }
};

module.exports = auditLogService;
