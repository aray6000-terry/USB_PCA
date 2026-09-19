// 前端 API 通訊與加密防護層
const API_BASE = (function () {
  if (typeof window === 'undefined') return '/api';
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

  // 發送請求並自動注入授權與安全校驗
  async request(endpoint, options = {}) {
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
          // Token 失效或過期，清除登入態
          this.clearSession();
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          throw new Error('登入逾時或憑證無效，請重新登入');
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || '帳號或密碼錯誤');
        }
      }

      // 若回傳為二進位檔案 (例如 Excel 匯出)
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
      console.error(`API Error [${endpoint}]:`, err.message);
      throw err;
    }
  }

  // 1. 身分驗證模組
  auth = {
    login: async (username, password) => {
      const res = await this.request('/auth/login', {
        method: 'POST',
        body: { username, password }
      });
      if (res.success && res.token) {
        this.setSession(res.token, res.user);
      }
      return res;
    },
    me: async () => {
      return await this.request('/auth/me');
    },
    getDemoUsers: async () => {
      return await this.request('/auth/demo-users');
    },
    applyAccount: async (formData) => {
      return await this.request('/auth/register-request', {
        method: 'POST',
        body: formData
      });
    },
    listApplications: async (status = 'all') => {
      const qs = status && status !== 'all' ? `?status=${status}` : '';
      return await this.request(`/auth/applications${qs}`);
    },
    reviewApplication: async (id, reviewData) => {
      return await this.request(`/auth/applications/${id}/review`, {
        method: 'PATCH',
        body: reviewData
      });
    },
    syncUsersSheet: async () => {
      return await this.request('/auth/sync-users-sheet', {
        method: 'POST'
      });
    }
  };

  // 2. 零用金申請單模組 (落實 RBAC 權限分流)
  claims = {
    list: async (params = {}) => {
      const qs = new URLSearchParams();
      Object.keys(params).forEach(k => {
        if (params[k] && params[k] !== 'all') qs.append(k, params[k]);
      });
      return await this.request(`/claims?${qs.toString()}`);
    },
    stats: async (month) => {
      const qs = month ? `?month=${month}` : '';
      return await this.request(`/claims/stats${qs}`);
    },
    create: async (claimData) => {
      return await this.request('/claims', {
        method: 'POST',
        body: claimData
      });
    },
    update: async (id, claimData) => {
      return await this.request(`/claims/${id}`, {
        method: 'PUT',
        body: claimData
      });
    },
    updateStatus: async (id, status, reason = '', approved_amount = null) => {
      const body = { status, reason };
      if (approved_amount !== null && approved_amount !== undefined && approved_amount !== '') {
        body.approved_amount = Number(approved_amount);
      }
      return await this.request(`/claims/${id}/status`, {
        method: 'PATCH',
        body
      });
    },
    getApprovalLogs: async (limit = 100) => {
      return await this.request(`/claims/approval-logs?limit=${limit}`);
    },
    downloadApprovalLogsUrl: () => {
      return `${API_BASE}/claims/approval-logs/download?token=${localStorage.getItem('petty_cash_token') || ''}`;
    },
    downloadApprovalLogs: async () => {
      return await this.request('/claims/approval-logs/download');
    },
    delete: async (id) => {
      return await this.request(`/claims/${id}`, {
        method: 'DELETE'
      });
    },
    recognizeReceipt: async (imageData, geminiApiKey = '') => {
      return await this.request('/claims/recognize-receipt', {
        method: 'POST',
        body: { image_data: imageData, gemini_api_key: geminiApiKey }
      });
    },
    batchCreate: async (claims, receiptUrl = '') => {
      return await this.request('/claims/batch-create', {
        method: 'POST',
        body: { claims, receipt_url: receiptUrl }
      });
    }
  };

  // 3. 報表匯出模組
  export = {
    excel: async (params = {}) => {
      const qs = new URLSearchParams();
      Object.keys(params).forEach(k => {
        if (params[k] && params[k] !== 'all') qs.append(k, params[k]);
      });
      return await this.request(`/export/excel?${qs.toString()}`);
    },
    csv: async (params = {}) => {
      const qs = new URLSearchParams();
      Object.keys(params).forEach(k => {
        if (params[k] && params[k] !== 'all') qs.append(k, params[k]);
      });
      return await this.request(`/export/csv?${qs.toString()}`);
    }
  };

  // 4. Google Sheets 串接模組
  sheets = {
    getStatus: async () => {
      return await this.request('/sheets/status');
    },
    getCodeGs: async () => {
      return await this.request('/sheets/code-gs');
    },
    testConnection: async (gasUrl = null) => {
      return await this.request('/sheets/test', {
        method: 'POST',
        body: gasUrl ? { gas_url: gasUrl } : {}
      });
    },
    syncAll: async () => {
      return await this.request('/sheets/sync', { method: 'POST' });
    },
    updateConfig: async (configData) => {
      return await this.request('/sheets/config', {
        method: 'POST',
        body: configData
      });
    }
  };
}

const api = new ApiService();
window.api = api;
