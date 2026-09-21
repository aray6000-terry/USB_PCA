const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DB_DIR, 'database.json');

// 確保資料夾存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// 預設資料庫結構
const initialData = {
  users: [],
  user_applications: [],
  claims: [],
  config: {
    system_name: '企業每月零用金申請與核銷系統',
    google_sheet_enabled: true,
    google_gas_url: 'https://script.google.com/macros/s/AKfycbxTdgqw22UF8KZCYCXlGo7SuwV7Q_nBWBC9wT6OJqEBIjb6Nea0V5bFSiy2JlMbSeMDxg/exec',
    google_spreadsheet_id: '',
    google_service_account_email: '',
    google_sheet_name: '零用金申請明細',
    last_sync_time: null,
    monthly_budget_warning: 50000
  }
};

let dbCache = null;

// 確保既有資料庫或新資料庫都有預設帳號 (含 terry 超級使用者)
function ensureDefaultUsers(data) {
  if (!data.users) data.users = [];
  const salt = bcrypt.genSaltSync(10);
  let changed = false;

  // 1. 確保 terry 是超級使用者 (admin)
  let terry = data.users.find(u => u.username.toLowerCase() === 'terry');
  if (!terry) {
    terry = {
      id: 'usr_terry_01',
      username: 'terry',
      password_hash: bcrypt.hashSync('terry123', salt),
      plain_password: 'terry123',
      name: 'Terry (超級使用者 / 陳總監)',
      role: 'admin',
      department: '總管理處',
      created_at: new Date().toISOString()
    };
    data.users.unshift(terry);
    changed = true;
    console.log('Default superuser terry seeded.');
  } else {
    if (terry.role !== 'admin') {
      terry.role = 'admin';
      changed = true;
    }
    if (!terry.plain_password) {
      terry.plain_password = 'terry123';
      changed = true;
    }
  }

  // 2. 確保 user 是示範業務同仁 (employee - 張小明)
  let demoUser = data.users.find(u => u.username.toLowerCase() === 'user');
  if (!demoUser) {
    demoUser = {
      id: 'usr_emp_01',
      username: 'user',
      password_hash: bcrypt.hashSync('user123', salt),
      plain_password: 'user123',
      name: '張小明 (業務同仁)',
      role: 'employee',
      department: '業務部',
      created_at: new Date().toISOString()
    };
    data.users.push(demoUser);
    changed = true;
  } else {
    if (demoUser.role !== 'employee') {
      demoUser.role = 'employee';
      changed = true;
    }
    if (!demoUser.plain_password) {
      demoUser.plain_password = 'user123';
      changed = true;
    }
  }

  // 3. 確保 amyliupp@gmail.com 是會計審核 (accountant - 劉彩雲)
  let amy = data.users.find(u => u.username.toLowerCase() === 'amyliupp@gmail.com');
  if (amy && !amy.plain_password) {
    amy.plain_password = 'amyliupp@gmail.com';
    changed = true;
  }

  // 4. 清理過往的 deprecated 帳號 (保留 user 與 terry 與 amyliupp)
  const deprecatedUsers = ['admin', 'accountant', 'employee', 'designer'];
  const originalLength = data.users.length;
  data.users = data.users.filter(u =>
    !deprecatedUsers.includes(u.username.toLowerCase()) &&
    !u.username.startsWith('user_') &&
    !u.username.startsWith('sheet_user_')
  );
  if (data.users.length !== originalLength) {
    changed = true;
  }

  // 5. 補齊 plain_password
  const defaultPwMap = {
    terry: 'terry123',
    user: 'user123',
    'amyliupp@gmail.com': 'amyliupp@gmail.com',
    'aray6000@hotmail.com': 'ray781008'
  };
  data.users.forEach(u => {
    if (!u.plain_password && defaultPwMap[u.username.toLowerCase()]) {
      u.plain_password = defaultPwMap[u.username.toLowerCase()];
      changed = true;
    }
  });

  if (changed) {
    saveDb(data);
  }
}

function loadDb(forceReload = false) {
  if (dbCache && !forceReload) {
    if (!dbCache.user_applications) dbCache.user_applications = [];
    return dbCache;
  }
  if (!fs.existsSync(DB_FILE)) {
    saveDb(initialData);
    seedDefaultData();
    return dbCache;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    dbCache = JSON.parse(raw);
    if (!dbCache.user_applications) dbCache.user_applications = [];
    ensureDefaultUsers(dbCache);
    return dbCache;
  } catch (err) {
    console.error('Failed to parse database.json, initializing new one:', err);
    saveDb(initialData);
    seedDefaultData();
    return dbCache;
  }
}

function saveDb(data) {
  dbCache = data;
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempFile, DB_FILE);
}

// 初始化系統最高管理員 (如果不存在)
function seedDefaultData() {
  const currentDb = dbCache || initialData;
  if (currentDb.users.length === 0) {
    console.log('Seeding initial superuser terry...');
    const salt = bcrypt.genSaltSync(10);
    
    currentDb.users = [
      {
        id: 'usr_terry_01',
        username: 'terry',
        password_hash: bcrypt.hashSync('terry123', salt),
        plain_password: 'terry123',
        name: 'Terry (超級使用者 / 陳總監)',
        role: 'admin',
        department: '總管理處',
        created_at: new Date().toISOString()
      }
    ];

    // 初始化示範申請單資料 (讓系統初次開啟就有豐富真實的視覺效果)
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = String(today.getMonth() + 1).padStart(2, '0');

    currentDb.claims = [
      {
        id: 'clm_demo_001',
        claim_no: `EXP-${curYear}${curMonth}-001`,
        user_id: 'usr_emp_01',
        user_name: '張小明 (業務同仁)',
        department: '業務一部',
        item_name: '拜訪客戶計程車資 (台北至新竹往返)',
        amount: 1450,
        expense_date: `${curYear}-${curMonth}-05`,
        category: '交通',
        receipt_no: 'UB-98214571',
        notes: '拜訪台積電外包商業務提案',
        receipt_url: '',
        status: 'disbursed',
        rejection_reason: '',
        audit_trail: [
          { action: '申請送出', by: '張小明', by_role: 'employee', at: `${curYear}-${curMonth}-05T10:00:00Z` },
          { action: '審核通過', by: '王會計', by_role: 'accountant', at: `${curYear}-${curMonth}-06T09:30:00Z` },
          { action: '已撥款核銷', by: '王會計', by_role: 'accountant', at: `${curYear}-${curMonth}-07T14:00:00Z` }
        ],
        sheet_synced: false,
        sheet_synced_at: null,
        created_at: `${curYear}-${curMonth}-05T10:00:00Z`,
        updated_at: `${curYear}-${curMonth}-07T14:00:00Z`
      },
      {
        id: 'clm_demo_002',
        claim_no: `EXP-${curYear}${curMonth}-002`,
        user_id: 'usr_emp_01',
        user_name: '張小明 (業務同仁)',
        department: '業務一部',
        item_name: '客戶專案商務午餐餐敘',
        amount: 2860,
        expense_date: `${curYear}-${curMonth}-08`,
        category: '交際費',
        receipt_no: 'INV-88741256',
        notes: '招待欣興電子採購經理共3人',
        receipt_url: '',
        status: 'approved',
        rejection_reason: '',
        audit_trail: [
          { action: '申請送出', by: '張小明', by_role: 'employee', at: `${curYear}-${curMonth}-08T15:20:00Z` },
          { action: '審核通過', by: '超級管理者', by_role: 'admin', at: `${curYear}-${curMonth}-09T11:00:00Z` }
        ],
        sheet_synced: false,
        sheet_synced_at: null,
        created_at: `${curYear}-${curMonth}-08T15:20:00Z`,
        updated_at: `${curYear}-${curMonth}-09T11:00:00Z`
      },
      {
        id: 'clm_demo_003',
        claim_no: `EXP-${curYear}${curMonth}-003`,
        user_id: 'usr_emp_02',
        user_name: '李小美 (設計同仁)',
        department: '設計研發組',
        item_name: '辦公室環保洗碗精與擦手紙補給',
        amount: 480,
        expense_date: `${curYear}-${curMonth}-10`,
        category: '清潔及庶務用品',
        receipt_no: 'PX-55412984',
        notes: '全聯採買茶水間耗材',
        receipt_url: '',
        status: 'pending',
        rejection_reason: '',
        audit_trail: [
          { action: '申請送出', by: '李小美', by_role: 'employee', at: `${curYear}-${curMonth}-10T11:15:00Z` }
        ],
        sheet_synced: false,
        sheet_synced_at: null,
        created_at: `${curYear}-${curMonth}-10T11:15:00Z`,
        updated_at: `${curYear}-${curMonth}-10T11:15:00Z`
      },
      {
        id: 'clm_demo_004',
        claim_no: `EXP-${curYear}${curMonth}-004`,
        user_id: 'usr_emp_02',
        user_name: '李小美 (設計同仁)',
        department: '設計研發組',
        item_name: 'USB-C 多功能集線器 (會議室外接用)',
        amount: 1290,
        expense_date: `${curYear}-${curMonth}-12`,
        category: '設備',
        receipt_no: 'PC-99124483',
        notes: '會議室簡報轉接線損壞採買新品',
        receipt_url: '',
        status: 'pending',
        rejection_reason: '',
        audit_trail: [
          { action: '申請送出', by: '李小美', by_role: 'employee', at: `${curYear}-${curMonth}-12T16:40:00Z` }
        ],
        sheet_synced: false,
        sheet_synced_at: null,
        created_at: `${curYear}-${curMonth}-12T16:40:00Z`,
        updated_at: `${curYear}-${curMonth}-12T16:40:00Z`
      }
    ];

    saveDb(currentDb);
  }
}

// 資料庫操作封裝 API
const db = {
  // 使用者
  findUserByUsername(username) {
    let data = loadDb();
    let found = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!found) {
      data = loadDb(true); // 強制重讀硬碟
      found = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    }
    return found;
  },
  findUserById(id) {
    const data = loadDb();
    return data.users.find(u => u.id === id);
  },
  listUsers() {
    const data = loadDb();
    return data.users.map(u => {
      const copy = Object.assign({}, u);
      delete copy.password_hash;
      return copy;
    });
  },

  // 從 Google 試算表最新資料即時更新或建立使用者 (登入即時同步)
  syncOrUpsertUserFromSheet(sheetUser) {
    const data = loadDb();
    if (!data.users) data.users = [];
    const usernameClean = String(sheetUser.username || '').trim();
    if (!usernameClean) return null;

    let existing = data.users.find(u => u.username.toLowerCase() === usernameClean.toLowerCase());
    const salt = bcrypt.genSaltSync(10);
    const pwd = sheetUser.password ? String(sheetUser.password).trim() : '';

    if (existing) {
      if (sheetUser.name) existing.name = sheetUser.name;
      if (sheetUser.department) existing.department = sheetUser.department;
      if (sheetUser.role) existing.role = sheetUser.role;
      if (pwd) {
        existing.plain_password = pwd;
        existing.password_hash = bcrypt.hashSync(pwd, salt);
      }
      saveDb(data);
      console.log(`[SHEET-SYNC-LOGIN] 使用者 ${existing.username} 已自 Google 試算表即時同步最新密碼與權限角色: ${existing.role}`);
      return existing;
    } else {
      const newUser = {
        id: sheetUser.id || `usr_sheet_${Date.now()}`,
        username: usernameClean,
        password_hash: pwd ? bcrypt.hashSync(pwd, salt) : '',
        plain_password: pwd,
        name: sheetUser.name || usernameClean,
        role: sheetUser.role || 'employee',
        department: sheetUser.department || '一般同仁',
        created_at: new Date().toISOString()
      };
      data.users.push(newUser);
      saveDb(data);
      console.log(`[SHEET-SYNC-LOGIN] 新同仁 ${newUser.username} 已自 Google 試算表建立至系統並即時開通`);
      return newUser;
    }
  },

  syncAllUsersFromSheetList(sheetUsers) {
    if (!Array.isArray(sheetUsers)) return;
    for (const su of sheetUsers) {
      this.syncOrUpsertUserFromSheet(su);
    }
  },

  // 零用金申請
  listClaims(filter = {}) {
    const data = loadDb();
    let result = [...(data.claims || [])];

    // RBAC: 如果有指定 userId，限制只查該同仁
    if (filter.user_id) {
      result = result.filter(c => c.user_id === filter.user_id || (filter.user_name && c.user_name === filter.user_name));
    }
    // 月份篩選 (YYYY-MM)
    if (filter.month && filter.month !== 'all') {
      result = result.filter(c => (c.expense_date || '').startsWith(filter.month));
    }
    // 類別篩選
    if (filter.category && filter.category !== 'all') {
      result = result.filter(c => c.category === filter.category);
    }
    // 狀態篩選
    if (filter.status && filter.status !== 'all') {
      result = result.filter(c => c.status === filter.status);
    }
    // 關鍵字搜尋 (項目名稱、單號、備註、申請人、發票號碼、類別、部門、金額)
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase().trim();
      result = result.filter(c => 
        (c.item_name && c.item_name.toLowerCase().includes(kw)) ||
        (c.claim_no && c.claim_no.toLowerCase().includes(kw)) ||
        (c.notes && c.notes.toLowerCase().includes(kw)) ||
        (c.user_name && c.user_name.toLowerCase().includes(kw)) ||
        (c.receipt_no && c.receipt_no.toLowerCase().includes(kw)) ||
        (c.category && c.category.toLowerCase().includes(kw)) ||
        (c.department && c.department.toLowerCase().includes(kw)) ||
        (c.amount && String(c.amount).includes(kw))
      );
    }

    // 依日期與建立時間倒序排序
    return result.sort((a, b) => new Date(b.expense_date || 0) - new Date(a.expense_date || 0));
  },

  findClaimById(id) {
    const data = loadDb();
    return data.claims.find(c => c.id === id);
  },

  generateClaimNo(expenseDate) {
    const data = loadDb();
    const d = new Date(expenseDate || new Date());
    const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `EXP-${yyyymm}-`;
    const sameMonthClaims = data.claims.filter(c => c.claim_no && c.claim_no.startsWith(prefix));
    const nextSeq = sameMonthClaims.length + 1;
    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  },

  createClaim(claimData) {
    const data = loadDb();
    data.claims.unshift(claimData);
    saveDb(data);
    return claimData;
  },

  updateClaim(id, updates) {
    const data = loadDb();
    const idx = data.claims.findIndex(c => c.id === id);
    if (idx === -1) return null;
    data.claims[idx] = {
      ...data.claims[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    saveDb(data);
    return data.claims[idx];
  },

  deleteClaim(id) {
    const data = loadDb();
    const idx = data.claims.findIndex(c => c.id === id);
    if (idx === -1) return false;
    data.claims.splice(idx, 1);
    saveDb(data);
    return true;
  },

  // 系統配置
  getConfig() {
    const data = loadDb();
    return data.config || initialData.config;
  },

  updateConfig(updates) {
    const data = loadDb();
    data.config = { ...data.config, ...updates };
    saveDb(data);
    return data.config;
  },

  // 帳號申請管理
  listUserApplications(status = 'all') {
    const data = loadDb();
    const apps = data.user_applications || [];
    if (status && status !== 'all') {
      return apps.filter(a => a.status === status);
    }
    return apps.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  findUserApplicationById(id) {
    const data = loadDb();
    return (data.user_applications || []).find(a => a.id === id);
  },

  findUserApplicationByUsername(username) {
    const data = loadDb();
    return (data.user_applications || []).find(a => a.username.toLowerCase() === username.toLowerCase());
  },

  createUserApplication(appData) {
    const data = loadDb();
    if (!data.user_applications) data.user_applications = [];
    const role = appData.role || appData.requested_role || 'employee';
    const reason = appData.apply_reason || appData.reason || '';
    const newApp = {
      id: `app_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: 'pending',
      created_at: new Date().toISOString(),
      ...appData,
      plain_password: appData.plain_password || appData.password || '',
      role: role,
      requested_role: role,
      apply_reason: reason,
      reason: reason
    };
    data.user_applications.unshift(newApp);
    saveDb(data);
    return newApp;
  },

  reviewUserApplication(id, { action, reviewer, assigned_role, reject_reason }) {
    const data = loadDb();
    if (!data.user_applications) data.user_applications = [];
    const app = data.user_applications.find(a => a.id === id);
    if (!app) return null;

    if (action === 'approve') {
      app.status = 'approved';
      app.reviewed_by = reviewer ? (reviewer.name || reviewer.username) : '系統管理員';
      app.reviewed_at = new Date().toISOString();

      // 自動建立並開通至正式使用者列表
      const role = assigned_role || app.requested_role || 'employee';
      const newUser = {
        id: `usr_${Date.now()}`,
        username: app.username,
        password_hash: app.password_hash,
        plain_password: app.plain_password || '',
        name: app.name,
        role: role,
        department: app.department || '一般同仁',
        created_at: new Date().toISOString()
      };
      data.users.push(newUser);
      saveDb(data);
      return { application: app, user: newUser };
    } else if (action === 'reject') {
      app.status = 'rejected';
      app.reject_reason = reject_reason || '未符合企業申請標準';
      app.reviewed_by = reviewer ? (reviewer.name || reviewer.username) : '系統管理員';
      app.reviewed_at = new Date().toISOString();
      saveDb(data);
      return { application: app };
    }
    return null;
  }
};

// 初始化載入
loadDb();

module.exports = db;
