// 企業零用金申請與核銷系統 - 前端核心控制器
(function () {
  'use strict';

  // 狀態管理
  const state = {
    user: null,
    claims: [],
    stats: null,
    sheetsStatus: null,
    currentEditingClaimId: null,
    currentReviewingClaimId: null,
    currentPreviewingClaim: null,
    filters: {
      month: '',
      category: 'all',
      status: 'all',
      keyword: ''
    },
    aiOcr: {
      currentImageBase64: null,
      recognizedReceipts: []
    }
  };

  // DOM 元素引用快取
  const dom = {
    // Views
    loginView: document.getElementById('login-view'),
    mainView: document.getElementById('main-view'),
    loginForm: document.getElementById('login-form'),
    inputLoginUser: document.getElementById('login-username'),
    inputLoginPass: document.getElementById('login-password'),
    btnLoginSubmit: document.getElementById('btn-submit-login'),

    // 帳號註冊與登入頁籤切換
    tabBtnLogin: document.getElementById('tab-btn-login'),
    tabBtnRegister: document.getElementById('tab-btn-register'),
    authPanelLogin: document.getElementById('auth-panel-login'),
    authPanelRegister: document.getElementById('auth-panel-register'),
    linkGoToRegister: document.getElementById('link-goto-register'),
    linkBackToLogin: document.getElementById('link-back-to-login'),
    registerForm: document.getElementById('register-form'),
    regUsername: document.getElementById('reg-username'),
    regName: document.getElementById('reg-name'),
    regPassword: document.getElementById('reg-password'),
    regPasswordConfirm: document.getElementById('reg-password-confirm'),
    regDepartment: document.getElementById('reg-department'),
    regRole: document.getElementById('reg-role'),
    regReason: document.getElementById('reg-reason'),
    btnSubmitRegister: document.getElementById('btn-submit-register'),
    
    // Header & User
    currentUserName: document.getElementById('current-user-name'),
    currentUserAvatar: document.getElementById('current-user-avatar'),
    currentUserRoleBadge: document.getElementById('current-user-role-badge'),
    currentUserDept: document.getElementById('current-user-dept'),
    selectRoleSwitch: document.getElementById('select-role-switch'),
    btnLogout: document.getElementById('btn-logout'),
    btnUserApplications: document.getElementById('btn-user-applications'),
    badgePendingAppsCount: document.getElementById('badge-pending-apps-count'),
    sheetsIndicator: document.getElementById('sheets-indicator'),
    
    // Stats
    statTotalAmount: document.getElementById('stat-total-amount'),
    statTotalCount: document.getElementById('stat-total-count'),
    statPendingAmount: document.getElementById('stat-pending-amount'),
    statPendingCount: document.getElementById('stat-pending-count'),
    statDisbursedAmount: document.getElementById('stat-disbursed-amount'),
    statDisbursedCount: document.getElementById('stat-disbursed-count'),
    statScopeTitle: document.getElementById('stat-scope-title'),
    statScopeDesc: document.getElementById('stat-scope-desc'),
    categoryChipsSummary: document.getElementById('category-chips-summary'),
    breakdownMonthTag: document.getElementById('breakdown-month-tag'),

    // Toolbar & Filters
    filterKeyword: document.getElementById('filter-keyword'),
    filterMonth: document.getElementById('filter-month'),
    filterCategory: document.getElementById('filter-category'),
    filterStatus: document.getElementById('filter-status'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    kpiCardTotal: document.getElementById('kpi-card-total'),
    kpiCardPending: document.getElementById('kpi-card-pending'),
    kpiCardDisbursed: document.getElementById('kpi-card-disbursed'),
    btnOpenCreateModal: document.getElementById('btn-open-create-modal'),
    btnExportDropdown: document.getElementById('btn-export-dropdown'),
    exportMenu: document.getElementById('export-menu'),
    btnExportExcel: document.getElementById('btn-export-excel'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnSheetsPanel: document.getElementById('btn-sheets-panel'),
    btnRefreshList: document.getElementById('btn-refresh-list'),
    btnRefreshListMini: document.getElementById('btn-refresh-list-mini'),

    // Table
    claimsTbody: document.getElementById('claims-tbody'),
    tableRecordCount: document.getElementById('table-record-count'),
    emptyState: document.getElementById('empty-state'),

    // Claim Modal
    modalClaim: document.getElementById('modal-claim'),
    modalClaimTitle: document.getElementById('modal-claim-title'),
    formClaim: document.getElementById('form-claim'),
    claimFormId: document.getElementById('claim-form-id'),
    claimDate: document.getElementById('claim-date'),
    claimCategory: document.getElementById('claim-category'),
    claimItem: document.getElementById('claim-item'),
    claimAmount: document.getElementById('claim-amount'),
    amountVerbalPreview: document.getElementById('amount-verbal-preview'),
    claimReceiptNo: document.getElementById('claim-receipt-no'),
    claimNotes: document.getElementById('claim-notes'),
    claimReceiptFile: document.getElementById('claim-receipt-file'),
    receiptUploadZone: document.getElementById('receipt-upload-zone'),
    uploadPrompt: document.getElementById('upload-prompt'),
    receiptPreviewWrapper: document.getElementById('receipt-preview-wrapper'),
    receiptPreviewImg: document.getElementById('receipt-preview-img'),
    btnRemoveReceipt: document.getElementById('btn-remove-receipt'),

    // Review Modal
    modalReview: document.getElementById('modal-review'),
    reviewWorkflowBanner: document.getElementById('review-workflow-banner'),
    reviewClaimNo: document.getElementById('review-claim-no'),
    reviewUserName: document.getElementById('review-user-name'),
    reviewItemName: document.getElementById('review-item-name'),
    reviewAmount: document.getElementById('review-amount'),
    reviewReason: document.getElementById('review-reason'),
    btnActionReject: document.getElementById('btn-action-reject'),
    btnActionApprove: document.getElementById('btn-action-approve'),
    btnActionDisburse: document.getElementById('btn-action-disburse'),
    reviewApprovedAmount: document.getElementById('review-approved-amount'),
    btnReviewResetAmount: document.getElementById('btn-review-reset-amount'),
    reviewDiffTag: document.getElementById('review-diff-tag'),
    reviewAmountVerbal: document.getElementById('review-amount-verbal'),
    btnOpenLogsFromReview: document.getElementById('btn-open-logs-from-review'),
    reviewReceiptRow: document.getElementById('review-receipt-row'),
    btnReviewViewReceipt: document.getElementById('btn-review-view-receipt'),

    // Audit Log Modal DOM
    btnApprovalLogs: document.getElementById('btn-approval-logs'),
    modalAuditLogs: document.getElementById('modal-audit-logs'),
    filterAuditLogKw: document.getElementById('filter-audit-log-kw'),
    btnRefreshAuditLogs: document.getElementById('btn-refresh-audit-logs'),
    btnDownloadAuditLogs: document.getElementById('btn-download-audit-logs'),
    auditLogsContainer: document.getElementById('audit-logs-container'),
    auditLogsCountSummary: document.getElementById('audit-logs-count-summary'),
    auditLogFileMeta: document.getElementById('audit-log-file-meta'),

    // User Applications Modal DOM (帳號申請審核彈窗)
    modalUserApplications: document.getElementById('modal-user-applications'),
    btnRefreshUserApps: document.getElementById('btn-refresh-user-apps'),
    btnSyncUsersSheet: document.getElementById('btn-sync-users-sheet'),
    userAppsList: document.getElementById('user-apps-list'),
    userAppsCountSummary: document.getElementById('user-apps-count-summary'),

    // Sheets Modal
    modalSheets: document.getElementById('modal-sheets'),
    bannerStatusTitle: document.getElementById('banner-status-title'),
    bannerStatusDesc: document.getElementById('banner-status-desc'),
    btnSyncNow: document.getElementById('btn-sync-now'),
    sheetsConfigSection: document.getElementById('sheets-config-section'),
    formSheetsConfig: document.getElementById('form-sheets-config'),
    cfgEmail: document.getElementById('cfg-email'),
    cfgSheetId: document.getElementById('cfg-sheet-id'),
    cfgDriveFolder: document.getElementById('cfg-drive-folder'),
    cfgKey: document.getElementById('cfg-key'),
    cfgSheetName: document.getElementById('cfg-sheet-name'),
    btnTestConnection: document.getElementById('btn-test-connection'),

    // GAS Web App 專屬 DOM
    formGasConfig: document.getElementById('form-gas-config'),
    cfgGasUrl: document.getElementById('cfg-gas-url'),
    btnTestGas: document.getElementById('btn-test-gas'),
    btnViewCodeGs: document.getElementById('btn-view-code-gs'),
    modalCodeGs: document.getElementById('modal-code-gs'),
    codeGsContent: document.getElementById('code-gs-content'),
    btnCopyCodeGs: document.getElementById('btn-copy-code-gs'),
    btnCopyCodeGs2: document.getElementById('btn-copy-code-gs-2'),

    // 憑證預覽彈窗 DOM
    modalReceiptViewer: document.getElementById('modal-receipt-viewer'),
    receiptViewerTitle: document.getElementById('receipt-viewer-title'),
    receiptViewerClaimNo: document.getElementById('receipt-viewer-claim-no'),
    receiptViewerReceiptNo: document.getElementById('receipt-viewer-receipt-no'),
    receiptViewerAmount: document.getElementById('receipt-viewer-amount'),
    receiptViewerImg: document.getElementById('receipt-viewer-img'),
    receiptViewerOpenLink: document.getElementById('receipt-viewer-open-link'),

    // A4 憑證列印中心 DOM
    btnQuickReceiptsA4: document.getElementById('btn-quick-receipts-a4'),
    btnExportReceiptsA4: document.getElementById('btn-export-receipts-a4'),
    modalReceiptsA4: document.getElementById('modal-receipts-a4'),
    a4LayoutMode: document.getElementById('a4-layout-mode'),
    a4SummaryHint: document.getElementById('a4-summary-hint'),
    a4EmptyNotice: document.getElementById('a4-empty-hint'),
    receiptsA4PrintableArea: document.getElementById('receipts-a4-printable-area'),
    btnDoPrintA4: document.getElementById('btn-do-print-a4'),

    // AI OCR 發票相片辨識建單 DOM
    btnOpenAiOcrModal: document.getElementById('btn-open-ai-ocr-modal'),
    modalAiOcr: document.getElementById('modal-ai-ocr'),
    btnToggleGeminiKey: document.getElementById('btn-toggle-gemini-key'),
    geminiKeyPanel: document.getElementById('gemini-key-panel'),
    inputGeminiApiKey: document.getElementById('input-gemini-api-key'),
    btnSaveGeminiKey: document.getElementById('btn-save-gemini-key'),
    aiStepUpload: document.getElementById('ai-step-upload'),
    aiDropzone: document.getElementById('ai-dropzone'),
    aiFileInput: document.getElementById('ai-file-input'),
    btnBrowseAiPhoto: document.getElementById('btn-browse-ai-photo'),
    btnSampleAiPhoto: document.getElementById('btn-sample-ai-photo'),
    aiStepLoading: document.getElementById('ai-step-loading'),
    aiLoadingPreviewImg: document.getElementById('ai-loading-preview-img'),
    aiLoadingTitle: document.getElementById('ai-loading-title'),
    aiLoadingDesc: document.getElementById('ai-loading-desc'),
    aiStepResults: document.getElementById('ai-step-results'),
    aiSourcePreviewImg: document.getElementById('ai-source-preview-img'),
    btnAiReupload: document.getElementById('btn-ai-reupload'),
    aiDetectedCount: document.getElementById('ai-detected-count'),
    btnAddManualReceipt: document.getElementById('btn-add-manual-receipt'),
    aiDetectedList: document.getElementById('ai-detected-list'),
    aiFooterSelectedCount: document.getElementById('ai-footer-selected-count'),
    aiFooterTotalAmount: document.getElementById('ai-footer-total-amount'),
    btnSubmitBatchClaims: document.getElementById('btn-submit-batch-claims'),

    // Toast
    toastContainer: document.getElementById('toast-container')
  };

  // ====================================================
  // 工具函數
  // ====================================================

  // Toast 訊息推播
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10B981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3B82F6" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCurrency(amount) {
    const num = Number(amount);
    return 'NT$ ' + (isNaN(num) ? 0 : num).toLocaleString('zh-TW');
  }

  // 金額轉中文大寫金額
  function numberToChineseAmount(n) {
    const fraction = ['角', '分'];
    const digit = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
    const unit = [
      ['元', '萬', '億'],
      ['', '拾', '佰', '仟']
    ];
    let num = Math.abs(n);
    if (isNaN(num) || num === 0) return '新台幣 零 元整';

    let s = '';
    for (let i = 0; i < unit[0].length && num > 0; i++) {
      let p = '';
      for (let j = 0; j < unit[1].length && num > 0; j++) {
        p = digit[num % 10] + unit[1][j] + p;
        num = Math.floor(num / 10);
      }
      s = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + s;
    }
    return '新台幣 ' + s.replace(/(零.)*零元/, '元').replace(/(零.)+/g, '零') + '整';
  }

  // ====================================================
  // 初始化與登入驗證
  // ====================================================

  async function initApp() {
    // 預設月份為當月 (YYYY-MM)
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    state.filters.month = `${yyyy}-${mm}`;
    dom.filterMonth.value = state.filters.month;
    dom.claimDate.value = today.toISOString().split('T')[0];
    if (dom.a4LayoutMode) {
      dom.a4LayoutMode.value = '12';
    }

    bindEvents();

    if (api.isAuthenticated()) {
      try {
        const res = await api.auth.me();
        if (res.success && res.user) {
          state.user = res.user;
          switchToMainView();
          return;
        }
      } catch (e) {
        api.clearSession();
      }
    }
    switchToLoginView();
  }

  function switchToLoginView() {
    dom.mainView.classList.remove('active');
    dom.mainView.style.display = 'none';
    dom.loginView.classList.add('active');
    dom.loginView.style.display = 'flex';
    if (dom.authPanelLogin) {
      dom.authPanelLogin.classList.add('active');
      dom.authPanelLogin.classList.remove('hidden');
      dom.authPanelLogin.style.display = 'block';
    }
    if (dom.authPanelRegister) {
      dom.authPanelRegister.classList.remove('active');
      dom.authPanelRegister.classList.add('hidden');
      dom.authPanelRegister.style.display = 'none';
    }
    if (dom.tabBtnLogin) dom.tabBtnLogin.classList.add('active');
    if (dom.tabBtnRegister) dom.tabBtnRegister.classList.remove('active');
  }

  function switchToMainView() {
    // 徹底將登入畫面完全從 DOM 排版流中隱藏與移除空間
    dom.loginView.classList.remove('active');
    dom.loginView.style.display = 'none';
    dom.mainView.classList.add('active');
    dom.mainView.style.display = 'block';
    updateHeaderUser();
    loadDashboardData();
    checkSheetsStatus();
  }

  // 取得後端伺服器 Base URL (自動辨識 GitHub Pages、Live Server 5500、8080 或本地 file:// 協定)
  function getServerBaseUrl() {
    if (typeof window === 'undefined') return 'http://localhost:3050';
    if (window.api && window.api.isCloudMode) {
      return '';
    }
    if (window.location.protocol === 'file:') {
      return 'http://localhost:3050';
    }
    // 若前端不是在後端 port (3050) 開啟 (例如 VS Code Live Server 5500 等)
    if (window.location.port && window.location.port !== '3050') {
      return `http://${window.location.hostname || 'localhost'}:3050`;
    }
    return window.location.origin;
  }

  // 安全解析上傳檔案網址 (支援 GitHub Pages 次目錄與本機 file:// 包含 # 字元之編碼)
  function resolveUploadUrl(rawUrl) {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('data:image') || rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('blob:')) {
      return rawUrl;
    }
    const cleanPath = rawUrl.replace(/^\/?(public\/)?uploads\//, '');

    // 1. 本地 file 協定 (例如 file:///d:/#1_GOOGLE_Antigravity/...)
    // 關鍵修復：路徑若含有 # 符號，Chrome/Edge 會將其解析為 URL Fragment (錨點)，導致嘗試開啟 file:///d:/ 而觸發「I/O error」！
    if (window.location.protocol === 'file:') {
      const safeHref = window.location.href.replace(/#/g, '%23');
      const dirUrl = safeHref.substring(0, safeHref.lastIndexOf('/') + 1);
      if (dirUrl.includes('/public/')) {
        return new URL('uploads/' + cleanPath, dirUrl).href;
      } else {
        return new URL('public/uploads/' + cleanPath, dirUrl).href;
      }
    }

    // 2. 雲端直連模式 (GitHub Pages: https://<user>.github.io/<repo>/...)
    if (window.api && window.api.isCloudMode) {
      const currentHref = window.location.href;
      const dirUrl = currentHref.substring(0, currentHref.lastIndexOf('/') + 1);
      if (dirUrl.includes('/public/')) {
        return new URL('uploads/' + cleanPath, dirUrl).href;
      } else {
        return new URL('public/uploads/' + cleanPath, dirUrl).href;
      }
    }

    // 3. 一般伺服器模式 (localhost:3050)
    const serverBase = getServerBaseUrl();
    return `${serverBase}${rawUrl.startsWith('/') ? rawUrl : '/' + rawUrl}`;
  }

  // 取得完整發票憑證網址 (智慧處理後端代理端點、本機檔案、Google Drive 與 Base64)
  function getFullReceiptUrl(url, claimId = null) {
    if (!url) return '';

    if (url.startsWith('data:image') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
      return url;
    }

    // 雲端直連模式 (GitHub Pages 靜態目錄讀取) 或 本地 file 協定
    if ((window.api && window.api.isCloudMode) || window.location.protocol === 'file:') {
      return resolveUploadUrl(url);
    }

    const serverBase = getServerBaseUrl();

    // 若有提供 claimId 且非純 Base64，優先使用後端二進位專屬代理端點
    if (claimId && !url.startsWith('data:image')) {
      return `${serverBase}/api/claims/${claimId}/receipt`;
    }

    return `${serverBase}${url.startsWith('/') ? url : '/' + url}`;
  }

  // 將 Base64 資料轉換為二進位 Blob (避免 Chrome/Edge 對 data: URL 進行頂層導航造成 I/O error)
  function base64ToBlob(dataUrl) {
    const parts = dataUrl.split(';base64,');
    const contentType = (parts[0].split(':')[1] || 'image/png').split(';')[0];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  }

  // 以獨立新分頁開啟發票原始圖檔檢視視窗 (完全免除 I/O error，內建下載與列印按鈕)
  function openReceiptViewerWindow(imgSrc, claim = {}) {
    const title = claim.claim_no ? `發票憑證_${claim.claim_no}` : '發票憑證原始相片';
    const amountStr = claim.amount ? `NT$ ${Number(claim.amount).toLocaleString('en-US')}` : '';
    const userStr = claim.user_name ? `${escapeHtml(claim.user_name)} (${escapeHtml(claim.department || '同仁')})` : '';
    const itemStr = claim.item_name ? `[${escapeHtml(claim.category || '未分類')}] ${escapeHtml(claim.item_name)}` : '';

    const win = window.open('', '_blank');
    if (!win) {
      showToast('在新分頁開啟被瀏覽器阻擋，請於網址列允許彈出式視窗', 'warning');
      return;
    }

    win.document.write(`
      <!DOCTYPE html>
      <html lang="zh-TW">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background-color: #0b0f19;
            color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
          }
          header {
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            padding: 12px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 10;
          }
          .title-area { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
          .title-tag { background: #2563eb; color: #fff; font-size: 13px; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-family: monospace; }
          .title-text { font-size: 15px; font-weight: 600; color: #e2e8f0; }
          .meta-text { font-size: 13px; color: #94a3b8; }
          .actions { display: flex; gap: 10px; }
          .btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.15s ease;
            border: 1px solid rgba(255, 255, 255, 0.15);
            background: rgba(255, 255, 255, 0.08);
            color: #f8fafc;
          }
          .btn:hover { background: rgba(255, 255, 255, 0.18); color: #fff; }
          .btn-primary { background: #2563eb; border-color: #3b82f6; }
          .btn-primary:hover { background: #1d4ed8; }
          main {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 30px;
            background: radial-gradient(circle at 50% 50%, #1e293b 0%, #0b0f19 100%);
          }
          .img-wrapper {
            max-width: 96vw;
            max-height: 85vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          img {
            max-width: 100%;
            max-height: 85vh;
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.12);
            transition: transform 0.2s ease;
          }
          @media print {
            header { display: none !important; }
            main { padding: 0 !important; background: #fff !important; }
            img { max-height: 98vh !important; box-shadow: none !important; border: none !important; }
          }
        </style>
      </head>
      <body>
        <header>
          <div class="title-area">
            <span class="title-tag">${escapeHtml(claim.claim_no || 'EXP')}</span>
            <span class="title-text">${itemStr || '發票憑證照片'}</span>
            <span class="meta-text">${userStr ? '申請同仁: ' + userStr : ''} ${amountStr ? '| ' + amountStr : ''}</span>
          </div>
          <div class="actions">
            <button onclick="downloadImg()" class="btn btn-primary">💾 下載原始照片</button>
            <button onclick="window.print()" class="btn">🖨️ 列印憑證</button>
            <button onclick="window.close()" class="btn">✕ 關閉視窗</button>
          </div>
        </header>
        <main>
          <div class="img-wrapper">
            <img id="main-receipt-img" src="${imgSrc}" alt="發票憑證相片" onerror="this.onerror=null; this.alt='⚠️ 照片載入失敗 (若為雲端模式請確認憑證已同步上傳至伺服器或 Google Drive)';" />
          </div>
        </main>
        <script>
          function downloadImg() {
            const img = document.getElementById('main-receipt-img');
            const a = document.createElement('a');
            a.href = img.src;
            a.download = '${title}.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
          }
        </script>
      </body>
      </html>
    `);
    win.document.close();
  }

  // 點擊「在新分頁開啟原始檔案」的安全排程處理
  function openReceiptInNewTab(claim) {
    if (!claim || !claim.receipt_url) {
      showToast('此申請單無發票憑證相片', 'warning');
      return;
    }

    const rawUrl = claim.receipt_url;

    // 1. Google Drive 網址：轉換為標準檢視 URL
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      const driveMatch = rawUrl.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|uc\?export=view&id=)([a-zA-Z0-9_-]+)/);
      if (driveMatch && driveMatch[1]) {
        const driveUrl = `https://drive.google.com/file/d/${driveMatch[1]}/view?usp=sharing`;
        window.open(driveUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      window.open(rawUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // 2. Base64 格式 (data:image/...)
    // Chrome / Edge 禁止頂層視窗導航至超長 data: URL (會觸發 I/O error 或安全防護)
    if (rawUrl.startsWith('data:image/')) {
      try {
        const blob = base64ToBlob(rawUrl);
        const blobUrl = URL.createObjectURL(blob);
        const win = window.open(blobUrl, '_blank');
        if (!win) {
          openReceiptViewerWindow(rawUrl, claim);
        } else {
          setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
        }
        return;
      } catch (err) {
        console.warn('Base64 to blob failed, fallback to viewer window:', err);
        openReceiptViewerWindow(rawUrl, claim);
        return;
      }
    }

    // 3. 本地 file 協定 (直接以編碼後的安全路徑於新分頁開啟原生圖檔)
    if (window.location.protocol === 'file:') {
      const resolvedUrl = resolveUploadUrl(rawUrl);
      window.open(resolvedUrl, '_blank');
      return;
    }

    // 4. 相對路徑 (uploads/...)
    const resolvedUrl = resolveUploadUrl(rawUrl);

    // 若彈窗內的圖片已經載入成功 (naturalWidth > 1)，優先以安全新分頁呈現
    const previewImg = dom.receiptViewerImg;
    const currentSrc = (previewImg && previewImg.currentSrc) || (previewImg && previewImg.src);
    if (currentSrc && (currentSrc.startsWith('data:image') || currentSrc.startsWith('blob:'))) {
      openReceiptViewerWindow(currentSrc, claim);
      return;
    }

    // 否則開啟安全 Viewer 視窗
    openReceiptViewerWindow(resolvedUrl, claim);
  }

  // 開啟發票憑證大圖即時檢視彈窗
  function openReceiptPreview(claimId) {
    const claim = state.claims.find(c => c.id === claimId);
    if (!claim || !claim.receipt_url) {
      showToast('此申請單無發票憑證相片', 'info');
      return;
    }

    state.currentPreviewingClaim = claim;

    const fullUrl = getFullReceiptUrl(claim.receipt_url, claim.id);
    const resolvedUrl = resolveUploadUrl(claim.receipt_url);

    dom.receiptViewerClaimNo.textContent = claim.claim_no || '-';
    dom.receiptViewerReceiptNo.textContent = claim.receipt_no || '(未填發票號)';
    dom.receiptViewerAmount.textContent = formatCurrency(claim.amount);

    const img = dom.receiptViewerImg;
    img.style.opacity = '0.3';
    img.alt = '發票憑證相片載入中...';

    img.onload = () => {
      img.style.opacity = '1';
    };

    let retryCount = 0;
    img.onerror = async () => {
      if (retryCount === 0) {
        retryCount++;
        console.warn('憑證圖片載入重試，嘗試解析後完整路徑:', resolvedUrl);
        img.src = resolvedUrl;
        return;
      }

      const serverBase = getServerBaseUrl();
      if (retryCount === 1 && !api.isCloudMode && serverBase) {
        retryCount++;
        console.warn('嘗試透過 Base64 終極備援端點載入憑證...');
        try {
          const resp = await fetch(`${serverBase}/api/claims/${claim.id}/receipt-base64`);
          const data = await resp.json();
          if (data.success && data.base64) {
            img.src = data.base64;
            return;
          }
        } catch (e) {
          console.error('Base64 備援端點亦無法存取:', e);
        }
      }

      img.alt = '⚠️ 圖片載入失敗 (檔案可能已被移動或伺服器未啟動)';
      showToast('圖片載入失敗，可點擊下方按鈕在新分頁開啟', 'warning');
    };

    img.src = fullUrl;

    // 智慧指派 href，供滑鼠中鍵或右鍵「在新分頁中開啟連結」使用
    if (claim.receipt_url.startsWith('data:image')) {
      try {
        const blob = base64ToBlob(claim.receipt_url);
        dom.receiptViewerOpenLink.href = URL.createObjectURL(blob);
      } catch (e) {
        dom.receiptViewerOpenLink.href = 'javascript:void(0)';
      }
    } else if (claim.receipt_url.includes('drive.google.com')) {
      const driveMatch = claim.receipt_url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|uc\?export=view&id=)([a-zA-Z0-9_-]+)/);
      dom.receiptViewerOpenLink.href = driveMatch && driveMatch[1]
        ? `https://drive.google.com/file/d/${driveMatch[1]}/view?usp=sharing`
        : claim.receipt_url;
    } else {
      dom.receiptViewerOpenLink.href = resolvedUrl;
    }

    dom.modalReceiptViewer.classList.add('active');
  }

  // ====================================================
  // 發票憑證相片 A4 自動排版與列印中心
  // ====================================================

  function openA4ReceiptsModal() {
    // 關閉匯出選單
    if (dom.btnExportDropdown && dom.btnExportDropdown.parentElement) {
      dom.btnExportDropdown.parentElement.classList.remove('open');
    }

    const itemsPerPage = parseInt(dom.a4LayoutMode ? dom.a4LayoutMode.value : '12', 10) || 12;
    renderA4Receipts(itemsPerPage);
    dom.modalReceiptsA4.classList.add('active');
  }

  function renderA4Receipts(itemsPerPage = 12) {
    dom.receiptsA4PrintableArea.innerHTML = '';

    // 篩選當前包含憑證相片的申請單
    const claimsWithReceipt = state.claims.filter(c => Boolean(c.receipt_url));

    if (claimsWithReceipt.length === 0) {
      dom.a4EmptyNotice.classList.remove('hidden');
      dom.a4SummaryHint.textContent = `當前篩選期間內無任何發票憑證相片可列印`;
      return;
    }

    dom.a4EmptyNotice.classList.add('hidden');

    const totalPages = Math.ceil(claimsWithReceipt.length / itemsPerPage);
    const totalAmount = claimsWithReceipt.reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const monthLabel = state.filters.month ? `${state.filters.month} 月份` : '全部期間';

    dom.a4SummaryHint.textContent = `共 ${claimsWithReceipt.length} 筆憑證照片 | 總金額: ${formatCurrency(totalAmount)} | 自動排版分頁為 ${totalPages} 頁 A4`;

    // 排滿指定張數自動分頁生成 .a4-sheet
    for (let i = 0; i < claimsWithReceipt.length; i += itemsPerPage) {
      const pageIndex = Math.floor(i / itemsPerPage) + 1;
      const pageClaims = claimsWithReceipt.slice(i, i + itemsPerPage);
      const sheet = createA4SheetElement(pageClaims, pageIndex, totalPages, itemsPerPage, monthLabel);
      dom.receiptsA4PrintableArea.appendChild(sheet);
    }
  }

  function createA4SheetElement(pageClaims, pageIndex, totalPages, itemsPerPage, monthLabel) {
    const sheet = document.createElement('div');
    sheet.className = 'a4-sheet';

    const pageSum = pageClaims.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const applicantInfo = state.user
      ? `${escapeHtml(state.user.name)} (${escapeHtml(state.user.department || '企業同仁')})`
      : '全公司申請';

    // 1. A4 報銷黏存單專用表頭
    const headerHtml = `
      <div class="a4-sheet-header">
        <div class="a4-main-title">企業零用金支出憑證黏存單</div>
        <div class="a4-sheet-meta">
          <div class="a4-meta-col">
            <span>申報月份 / 期間：<strong>${escapeHtml(monthLabel)}</strong></span>
            <span>申報人員 / 單位：<strong>${applicantInfo}</strong></span>
          </div>
          <div class="a4-meta-col" style="text-align: right;">
            <span>列印產生日期：<strong>${new Date().toLocaleDateString('zh-TW')}</strong></span>
            <span>頁碼：<strong>第 ${pageIndex} 頁 / 共 ${totalPages} 頁</strong></span>
          </div>
        </div>
      </div>
    `;

    // 2. 憑證相片網格區 (排滿後下一頁自動續接)
    let cardsHtml = '';
    pageClaims.forEach(c => {
      const fullUrl = getFullReceiptUrl(c.receipt_url, c.id);
      cardsHtml += `
        <div class="a4-receipt-card">
          <div class="a4-receipt-img-box">
            <img src="${fullUrl}" alt="${escapeHtml(c.claim_no)} 憑證照片" loading="lazy">
          </div>
          <div class="a4-receipt-details">
            <div class="a4-detail-row-top">
              <span class="a4-claim-no">${escapeHtml(c.claim_no)}</span>
              <span class="a4-claim-date">${escapeHtml(c.expense_date)}</span>
            </div>
            <div class="a4-item-desc" title="${escapeHtml(c.item_name)}">
              [${escapeHtml(c.category)}] ${escapeHtml(c.item_name)}
            </div>
            <div class="a4-detail-row-bottom">
              <span class="a4-claim-meta-small">
                發票號: ${escapeHtml(c.receipt_no || '未填寫')} | 申請人: ${escapeHtml(c.user_name)}
              </span>
              <span class="a4-claim-amount-badge">${formatCurrency(c.amount)}</span>
            </div>
          </div>
        </div>
      `;
    });

    const gridHtml = `
      <div class="a4-grid-container a4-grid-mode-${itemsPerPage}">
        ${cardsHtml}
      </div>
    `;

    // 3. A4 表尾標準財務審核簽章欄
    const footerHtml = `
      <div class="a4-approval-wrapper">
        <table class="a4-approval-table">
          <thead>
            <tr>
              <th style="width: 25%;">總經理</th>
              <th style="width: 25%;">會計人員審核</th>
              <th style="width: 25%;">部門主管核准</th>
              <th style="width: 25%;">經手 / 申請人簽章</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div class="a4-footer-footnote">
          <span>本頁憑證金額小計：<strong>${formatCurrency(pageSum)}</strong></span>
          <span>※ 請將紙本發票或收據正本依序平整黏貼於對應方框內，以利財務及稅務稽核。</span>
        </div>
      </div>
    `;

    sheet.innerHTML = headerHtml + gridHtml + footerHtml;
    return sheet;
  }

  // ====================================================
  // AI 智能發票/收據辨識與自動建單模組 (支援單照多張發票)
  // ====================================================

  function openAiOcrModal(triggerFilePicker = false) {
    state.aiOcr.currentImageBase64 = null;
    state.aiOcr.recognizedReceipts = [];

    // 恢復步驟 1: 上傳
    dom.aiStepUpload.classList.remove('hidden');
    dom.aiStepLoading.classList.add('hidden');
    dom.aiStepResults.classList.add('hidden');

    // 讀取本地已儲存之 Gemini API Key
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    if (dom.inputGeminiApiKey) {
      dom.inputGeminiApiKey.value = savedKey;
    }

    // 重設清單與合計
    dom.aiDetectedList.innerHTML = '';
    updateAiFooterTotals();

    // 顯示 Modal 7
    dom.modalAiOcr.classList.add('active');

    // 若設定直接彈出檔案/相機選擇器
    if (triggerFilePicker && dom.aiFileInput) {
      setTimeout(() => {
        dom.aiFileInput.click();
      }, 100);
    }
  }

  async function handleAiImageUpload(source) {
    let dataUrl = '';
    if (typeof source === 'string') {
      dataUrl = source;
    } else if (source instanceof File || source instanceof Blob) {
      if (source.size > 10 * 1024 * 1024) {
        showToast('相片大小不得超過 10MB', 'error');
        return;
      }
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(source);
      });
    }

    if (!dataUrl) return;

    state.aiOcr.currentImageBase64 = dataUrl;

    // 切換至步驟 2: 掃描中動畫
    dom.aiStepUpload.classList.add('hidden');
    dom.aiStepResults.classList.add('hidden');
    dom.aiStepLoading.classList.remove('hidden');
    dom.aiLoadingPreviewImg.src = dataUrl;
    dom.aiLoadingTitle.textContent = 'AI 多模態視覺深度分析中...';
    dom.aiLoadingDesc.textContent = '正在定位並分離照片中每一張發票邊界、辨識品項名稱、消費金額與統編...';

    const apiKey = (dom.inputGeminiApiKey ? dom.inputGeminiApiKey.value.trim() : '') || localStorage.getItem('gemini_api_key') || '';

    try {
      const res = await api.claims.recognizeReceipt(dataUrl, apiKey);
      if (res.success && Array.isArray(res.receipts)) {
        state.aiOcr.recognizedReceipts = res.receipts.map((r, idx) => ({
          id: 'rec_' + Date.now() + '_' + idx,
          selected: true,
          expense_date: r.expense_date || new Date().toISOString().split('T')[0],
          category: ['交通', '餐食', '設備', '交際費', '清潔及庶務用品', '其他'].includes(r.category) ? r.category : '其他',
          item_name: r.item_name || '消費支出',
          amount: Number(r.amount) || 0,
          receipt_no: r.receipt_no || '',
          notes: r.notes || ''
        }));

        // 切換至步驟 3: 結果編輯預覽
        dom.aiStepLoading.classList.add('hidden');
        dom.aiStepResults.classList.remove('hidden');
        dom.aiSourcePreviewImg.src = dataUrl;

        renderAiDetectedReceipts();
        showToast(res.message || `辨識完成！共識別出 ${res.receipts.length} 張發票/收據`, 'success');
      } else {
        throw new Error(res.message || '無法辨識發票內容');
      }
    } catch (err) {
      console.error('OCR Error:', err);
      showToast('辨識失敗: ' + (err.message || '未知錯誤'), 'error');
      dom.aiStepLoading.classList.add('hidden');
      dom.aiStepUpload.classList.remove('hidden');
    }
  }

  function renderAiDetectedReceipts() {
    dom.aiDetectedList.innerHTML = '';
    const receipts = state.aiOcr.recognizedReceipts;

    dom.aiDetectedCount.textContent = `已辨識 ${receipts.length} 張發票 / 收據`;

    if (receipts.length === 0) {
      dom.aiDetectedList.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">📑</div>
          <p>未辨識出任何發票資料</p>
          <button type="button" class="btn btn-sm btn-outline" style="margin-top: 10px;" id="btn-empty-add-receipt">
            ➕ 手動新增一張
          </button>
        </div>
      `;
      const emptyAddBtn = document.getElementById('btn-empty-add-receipt');
      if (emptyAddBtn) emptyAddBtn.addEventListener('click', addManualReceiptCard);
      updateAiFooterTotals();
      return;
    }

    const categories = ['交通', '餐食', '設備', '交際費', '清潔及庶務用品', '其他'];

    receipts.forEach((r, index) => {
      const card = document.createElement('div');
      card.className = `ai-card-item ${r.selected ? 'selected' : ''}`;
      card.id = `card-${r.id}`;

      let optionsHtml = '';
      categories.forEach(cat => {
        optionsHtml += `<option value="${cat}" ${r.category === cat ? 'selected' : ''}>${cat}</option>`;
      });

      card.innerHTML = `
        <div class="ai-card-content">
          <!-- 第一列: 標頭狀態、類別、消費日期、刪除 -->
          <div class="ai-card-header-bar">
            <div class="ai-card-header-left">
              <input type="checkbox" class="ai-card-checkbox" data-id="${r.id}" ${r.selected ? 'checked' : ''} title="勾選是否送出此筆">
              <span class="ai-receipt-badge">發票 #${index + 1}</span>
              <select class="ai-card-field-category" data-id="${r.id}" data-field="category">
                ${optionsHtml}
              </select>
            </div>
            <div class="ai-card-header-right">
              <input type="date" class="ai-card-field-date" data-id="${r.id}" data-field="expense_date" value="${escapeHtml(r.expense_date)}">
              <button type="button" class="ai-card-btn-delete" data-id="${r.id}" title="刪除此筆發票">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- 第二列: 項目名稱 (整行全寬輸入，品項清楚易讀) -->
          <div class="ai-card-row-item">
            <input type="text" class="ai-card-field-item" data-id="${r.id}" data-field="item_name" value="${escapeHtml(r.item_name)}" placeholder="請填寫消費項目說明 (例如：公務拜訪出差高鐵票、研磨咖啡豆)">
          </div>

          <!-- 第三列: 金額、發票號碼與店家備註 -->
          <div class="ai-card-row-bottom">
            <div class="ai-amount-box">
              <span class="ai-amount-prefix">NT$</span>
              <input type="number" class="ai-card-field-amount" data-id="${r.id}" data-field="amount" value="${r.amount}" placeholder="金額" min="1">
            </div>
            <input type="text" class="ai-card-field-receipt-no" data-id="${r.id}" data-field="receipt_no" value="${escapeHtml(r.receipt_no || '')}" placeholder="發票號碼 / 統編">
            <input type="text" class="ai-card-field-notes" data-id="${r.id}" data-field="notes" value="${escapeHtml(r.notes || '')}" placeholder="備註說明 (選填)">
          </div>
        </div>
      `;

      // 綁定選取狀態切換
      const chk = card.querySelector('.ai-card-checkbox');
      chk.addEventListener('change', () => {
        r.selected = chk.checked;
        if (r.selected) {
          card.classList.add('selected');
        } else {
          card.classList.remove('selected');
        }
        updateAiFooterTotals();
      });

      // 綁定各欄位即時雙向更新
      card.querySelectorAll('input[data-field], select[data-field]').forEach(input => {
        input.addEventListener('input', () => {
          const field = input.dataset.field;
          if (field === 'amount') {
            r.amount = Number(input.value) || 0;
            updateAiFooterTotals();
          } else {
            r[field] = input.value;
          }
        });
      });

      // 刪除按鈕
      const delBtn = card.querySelector('.ai-card-btn-delete');
      delBtn.addEventListener('click', () => {
        deleteReceiptCard(r.id);
      });

      dom.aiDetectedList.appendChild(card);
    });

    updateAiFooterTotals();
  }

  function updateAiFooterTotals() {
    const receipts = state.aiOcr.recognizedReceipts;
    const selectedReceipts = receipts.filter(r => r.selected);
    const totalAmount = selectedReceipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    dom.aiFooterSelectedCount.textContent = `已勾選 ${selectedReceipts.length} 筆 (共 ${receipts.length} 筆)`;
    dom.aiFooterTotalAmount.textContent = `合計 NT$ ${totalAmount.toLocaleString()}`;

    if (selectedReceipts.length > 0) {
      dom.btnSubmitBatchClaims.disabled = false;
      dom.btnSubmitBatchClaims.textContent = `🚀 一鍵自動建立 ${selectedReceipts.length} 筆申請單`;
    } else {
      dom.btnSubmitBatchClaims.disabled = true;
      dom.btnSubmitBatchClaims.textContent = '請至少勾選一筆申請單';
    }
  }

  function addManualReceiptCard() {
    const today = new Date().toISOString().split('T')[0];
    state.aiOcr.recognizedReceipts.push({
      id: 'rec_manual_' + Date.now(),
      selected: true,
      expense_date: today,
      category: '其他',
      item_name: '',
      amount: 0,
      receipt_no: '',
      notes: '手動補充'
    });
    renderAiDetectedReceipts();
  }

  function deleteReceiptCard(id) {
    state.aiOcr.recognizedReceipts = state.aiOcr.recognizedReceipts.filter(r => r.id !== id);
    renderAiDetectedReceipts();
  }

  async function submitBatchClaims() {
    const selected = state.aiOcr.recognizedReceipts.filter(r => r.selected);
    if (selected.length === 0) {
      showToast('請勾選欲送出的發票資料', 'error');
      return;
    }

    for (let i = 0; i < selected.length; i++) {
      const r = selected[i];
      if (!r.item_name.trim()) {
        showToast(`第 ${i + 1} 筆發票缺少項目名稱`, 'error');
        return;
      }
      if (!r.amount || Number(r.amount) <= 0) {
        showToast(`第 ${i + 1} 筆發票「${r.item_name}」金額必須大於 0`, 'error');
        return;
      }
    }

    try {
      dom.btnSubmitBatchClaims.disabled = true;
      dom.btnSubmitBatchClaims.textContent = '建立申請單中...';
      showToast(`正在由照片自動批次建立 ${selected.length} 筆零用金申請單...`, 'info');

      const claimsPayload = selected.map(r => ({
        expense_date: r.expense_date,
        category: r.category,
        item_name: r.item_name.trim(),
        amount: Number(r.amount),
        receipt_no: (r.receipt_no || '').trim(),
        notes: (r.notes || '').trim()
      }));

      const res = await api.claims.batchCreate(claimsPayload, state.aiOcr.currentImageBase64);
      if (res.success) {
        showToast(res.message || `成功建立 ${res.count} 筆申請單！`, 'success');
        dom.modalAiOcr.classList.remove('active');
        loadDashboardData();
      } else {
        showToast(res.message || '建立失敗', 'error');
      }
    } catch (err) {
      console.error('Batch create error:', err);
      showToast('批次建立失敗: ' + (err.message || '未知錯誤'), 'error');
    } finally {
      dom.btnSubmitBatchClaims.disabled = false;
      updateAiFooterTotals();
    }
  }

  // 產生測試範本發票照片 (包含 2 張真實風格發票與收據)
  function generateSampleReceiptImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    // 背景: 桌面紋理
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, 0, 900, 600);

    // 發票 1: 台灣電子發票證明聯 (左側)
    ctx.save();
    ctx.translate(60, 40);
    ctx.rotate(-0.02);
    ctx.fillStyle = '#F8FAFC';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fillRect(0, 0, 360, 520);
    ctx.shadowColor = 'transparent';

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 22px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('全家便利商店', 180, 50);

    ctx.font = 'bold 18px "Noto Sans TC", sans-serif';
    ctx.fillText('電子發票證明聯', 180, 85);
    ctx.font = 'bold 16px monospace';
    ctx.fillText('115年 09-10月', 180, 115);
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#1E40AF';
    ctx.fillText('AB-98765432', 180, 150);

    ctx.fillStyle = '#334155';
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('2026-09-18 14:32:10', 30, 185);
    ctx.fillText('隨機碼 4892  總計 NT$ 350', 30, 205);
    ctx.fillText('賣方 12345678  買方 87654321', 30, 225);

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 240);
    ctx.lineTo(330, 240);
    ctx.stroke();

    ctx.font = '14px "Noto Sans TC", sans-serif';
    ctx.fillText('辦公室研磨咖啡豆 × 1', 30, 270);
    ctx.textAlign = 'right';
    ctx.fillText('$230', 330, 270);
    ctx.textAlign = 'left';
    ctx.fillText('鮮乳 936ml × 1', 30, 300);
    ctx.textAlign = 'right';
    ctx.fillText('$120', 330, 300);

    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(30, 320);
    ctx.lineTo(330, 320);
    ctx.stroke();

    ctx.font = 'bold 18px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.fillText('總計：NT$ 350', 330, 350);

    // 條碼與 QR Code 裝飾
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(50, 380, 260, 40);
    ctx.fillRect(60, 440, 60, 60);
    ctx.fillRect(240, 440, 60, 60);
    ctx.restore();

    // 發票 2: 計程車乘車證明收據 (右側)
    ctx.save();
    ctx.translate(470, 70);
    ctx.rotate(0.03);
    ctx.fillStyle = '#FEFCE8';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fillRect(0, 0, 370, 460);
    ctx.shadowColor = 'transparent';

    ctx.fillStyle = '#854D0E';
    ctx.font = 'bold 20px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('台灣大車隊 乘車證明收據', 185, 55);

    ctx.strokeStyle = '#E2E8F0';
    ctx.strokeRect(20, 75, 330, 360);

    ctx.fillStyle = '#1E293B';
    ctx.font = '14px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('乘車日期：2026-09-18', 40, 115);
    ctx.fillText('上車地點：台北車站', 40, 150);
    ctx.fillText('下車地點：南港軟體園區', 40, 185);
    ctx.fillText('車號：TDC-8899', 40, 220);
    ctx.fillText('里程：12.5 公里', 40, 255);

    ctx.font = 'bold 16px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#B45309';
    ctx.fillText('車資總額：NT$ 420 元整', 40, 305);

    ctx.font = '13px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#64748B';
    ctx.fillText('司機簽署：陳大明 (專章)', 40, 350);
    ctx.fillText('統一編號：24589901', 40, 380);

    // 圓形印章
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(280, 350, 45, 30, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#DC2626';
    ctx.font = 'bold 12px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('台灣大車隊', 280, 345);
    ctx.fillText('收據專用章', 280, 360);

    ctx.restore();

    return canvas.toDataURL('image/png');
  }

  function updateHeaderUser() {
    if (!state.user) return;
    dom.currentUserName.textContent = state.user.name;
    dom.currentUserAvatar.textContent = state.user.name.charAt(0);
    dom.currentUserDept.textContent = state.user.department || '企業同仁';

    const roleMap = {
      admin: { text: '超級使用者', class: 'badge-admin' },
      accountant: { text: '會計人員', class: 'badge-accountant' },
      employee: { text: '一般員工', class: 'badge-employee' }
    };
    const roleInfo = roleMap[state.user.role] || { text: state.user.role, class: 'badge-employee' };
    dom.currentUserRoleBadge.textContent = roleInfo.text;
    dom.currentUserRoleBadge.className = `role-badge ${roleInfo.class}`;

    // 設定快捷選單同步
    if (dom.selectRoleSwitch) {
      dom.selectRoleSwitch.value = state.user.username;
    }

    // RBAC 視角調整
    if (state.user.role === 'employee') {
      dom.statScopeTitle.textContent = '個人申請範圍';
      dom.statScopeDesc.textContent = '依資安權限，您僅能查閱與維護本人之零用金申請';
      dom.btnSheetsPanel.style.display = 'none'; // 員工不需管理 Google Sheets
      if (dom.btnApprovalLogs) dom.btnApprovalLogs.style.display = 'none'; // 員工隱藏金額異動 Log 檔
      if (dom.btnUserApplications) dom.btnUserApplications.style.display = 'none';
    } else if (state.user.role === 'accountant') {
      dom.statScopeTitle.textContent = '全公司核銷審核';
      dom.statScopeDesc.textContent = '您可審核全公司申請、核定實批金額並調閱稽核日誌';
      dom.btnSheetsPanel.style.display = 'inline-flex';
      if (dom.btnApprovalLogs) dom.btnApprovalLogs.style.display = 'inline-flex';
      if (dom.btnUserApplications) dom.btnUserApplications.style.display = 'none';
    } else {
      dom.statScopeTitle.textContent = '超級管理者權限';
      dom.statScopeDesc.textContent = '擁有最高審核、實批金額核定與伺服器 Log 檔完整調閱權限';
      dom.btnSheetsPanel.style.display = 'inline-flex';
      if (dom.btnApprovalLogs) dom.btnApprovalLogs.style.display = 'inline-flex';
      if (dom.btnUserApplications) {
        dom.btnUserApplications.style.display = 'inline-flex';
        loadPendingApplicationsCount();
      }
    }
  }

  // 快速身分視角切換 (超級使用者 / 會計審核 / 一般同仁)
  async function switchActiveRole(username) {
    if (!username) return;
    try {
      showToast('正在切換身分視角...', 'info');
      const credentialsMap = {
        'terry': { username: 'terry', password: 'terry123' },
        'user': { username: 'user', password: 'user123' },
        'amyliupp@gmail.com': { username: 'amyliupp@gmail.com', password: 'amyliupp@gmail.com' },
        'aray6000@hotmail.com': { username: 'aray6000@hotmail.com', password: 'ray781008' },
        'lin': { username: 'lin', password: 'user123' }
      };

      const cred = credentialsMap[username] || { username, password: 'user123' };

      const res = await api.auth.login(cred.username, cred.password);
      if (res.success && res.user) {
        state.user = res.user;
        updateHeaderUser();
        // 重設篩選條件
        state.filters.category = 'all';
        state.filters.status = 'all';
        state.filters.keyword = '';
        if (dom.filterKeyword) dom.filterKeyword.value = '';
        if (dom.filterCategory) dom.filterCategory.value = 'all';
        if (dom.filterStatus) dom.filterStatus.value = 'all';
        await loadDashboardData();
        showToast(`已切換為：${state.user.name} (${dom.currentUserRoleBadge.textContent})`, 'success');
      } else {
        showToast('切換失敗: ' + (res.message || '無法取得授權'), 'error');
      }
    } catch (err) {
      showToast('切換失敗: ' + err.message, 'error');
    }
  }

  // ====================================================
  // 帳號申請審核管理 (超級使用者專用)
  // ====================================================

  let cachedUserApplications = [];
  let currentUserAppFilter = 'all';

  async function loadPendingApplicationsCount() {
    if (!state.user || state.user.role !== 'admin' || !dom.badgePendingAppsCount) return;
    try {
      const res = await api.auth.listApplications('pending');
      if (res.success) {
        const count = (res.applications || []).length;
        if (count > 0) {
          dom.badgePendingAppsCount.textContent = count;
          dom.badgePendingAppsCount.style.display = 'inline-block';
        } else {
          dom.badgePendingAppsCount.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('載入待審核帳號數量失敗:', e);
    }
  }

  async function openUserApplicationsModal(filterStatus = 'all') {
    if (!dom.modalUserApplications) return;
    currentUserAppFilter = filterStatus;
    dom.modalUserApplications.classList.add('active');
    
    // 更新 tab active 狀態
    const tabs = dom.modalUserApplications.querySelectorAll('.app-tab-btn');
    tabs.forEach(tab => {
      if (tab.dataset.status === filterStatus) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    dom.userAppsList.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">正在載入申請清單...</div>';

    try {
      const res = await api.auth.listApplications();
      if (res.success) {
        cachedUserApplications = res.applications || [];
        renderUserApplicationsList(currentUserAppFilter);
        loadPendingApplicationsCount();
      } else {
        dom.userAppsList.innerHTML = `<div style="color:#EF4444;text-align:center;padding:20px;">載入失敗: ${escapeHtml(res.message)}</div>`;
      }
    } catch (err) {
      dom.userAppsList.innerHTML = `<div style="color:#EF4444;text-align:center;padding:20px;">載入錯誤: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderUserApplicationsList(filterStatus = 'all') {
    if (!dom.userAppsList) return;
    dom.userAppsList.innerHTML = '';

    const filtered = cachedUserApplications.filter(app => {
      if (filterStatus === 'all') return true;
      return app.status === filterStatus;
    });

    if (dom.userAppsCountSummary) {
      const pendingCount = cachedUserApplications.filter(a => a.status === 'pending').length;
      dom.userAppsCountSummary.textContent = `共 ${cachedUserApplications.length} 筆註冊申請 (待審核: ${pendingCount} 筆)`;
    }

    if (filtered.length === 0) {
      dom.userAppsList.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:var(--text-muted);">
          <div style="font-size:36px;margin-bottom:10px;">📋</div>
          <div>目前無任何${filterStatus === 'pending' ? '待審核' : ''}帳號註冊申請</div>
        </div>
      `;
      return;
    }

    filtered.forEach(app => {
      const card = document.createElement('div');
      card.className = `user-app-card status-${app.status}`;

      const roleBadgeMap = {
        employee: '<span class="role-badge badge-employee">一般員工</span>',
        accountant: '<span class="role-badge badge-accountant">會計人員</span>',
        admin: '<span class="role-badge badge-admin">超級使用者</span>'
      };

      const statusBadgeMap = {
        pending: '<span class="status-pill status-pill-pending">⏳ 待管理者審核</span>',
        approved: '<span class="status-pill status-pill-approved">✓ 已核准開通</span>',
        rejected: '<span class="status-pill status-pill-rejected">✕ 已駁回</span>'
      };

      const formattedDate = new Date(app.created_at).toLocaleString('zh-TW', { hour12: false });
      const reviewedDate = app.reviewed_at ? new Date(app.reviewed_at).toLocaleString('zh-TW', { hour12: false }) : '';

      let actionsHtml = '';
      if (app.status === 'pending') {
        actionsHtml = `
          <div class="user-app-actions">
            <button class="btn btn-sm btn-outline-danger btn-app-reject" data-id="${app.id}">駁回申請</button>
            <button class="btn btn-sm btn-success btn-app-approve" data-id="${app.id}">核准開通帳號</button>
          </div>
        `;
      } else if (app.status === 'approved') {
        actionsHtml = `
          <div style="font-size:12px;color:#34D399;text-align:right;font-weight:500;">
            ✓ 由 ${escapeHtml(app.reviewer_name || '主管')} 於 ${reviewedDate} 開通
          </div>
        `;
      } else {
        actionsHtml = `
          <div style="font-size:12px;color:#F87171;text-align:right;font-weight:500;">
            ✕ 於 ${reviewedDate} 駁回${app.review_note ? ` (${escapeHtml(app.review_note)})` : ''}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="user-app-card-header">
          <div class="user-app-info-main">
            <span class="user-app-name">${escapeHtml(app.name)}</span>
            <span class="user-app-username">@${escapeHtml(app.username)}</span>
            <span class="user-app-dept">${escapeHtml(app.department || '未分配部門')}</span>
          </div>
          <div class="user-app-meta-badges">
            ${roleBadgeMap[app.role] || app.role}
            ${statusBadgeMap[app.status] || app.status}
          </div>
        </div>

        <div class="user-app-reason-box">
          <div class="user-app-reason-label">申請開通理由 / 業務職掌：</div>
          <div class="user-app-reason-text">${escapeHtml(app.apply_reason || '（未填寫）')}</div>
        </div>

        <div class="user-app-footer">
          <div class="user-app-time">申請送出時間：${formattedDate}</div>
          ${actionsHtml}
        </div>
      `;

      dom.userAppsList.appendChild(card);
    });

    // 綁定審核按鈕
    dom.userAppsList.querySelectorAll('.btn-app-approve').forEach(btn => {
      btn.addEventListener('click', () => handleReviewUserApplication(btn.dataset.id, 'approve'));
    });
    dom.userAppsList.querySelectorAll('.btn-app-reject').forEach(btn => {
      btn.addEventListener('click', () => handleReviewUserApplication(btn.dataset.id, 'reject'));
    });
  }

  async function handleReviewUserApplication(appId, action) {
    const app = cachedUserApplications.find(a => a.id === appId);
    if (!app) return;

    let reviewNote = '';
    if (action === 'reject') {
      reviewNote = window.prompt(`請輸入駁回【${app.name} (@${app.username})】申請的原因：`, '未符合帳號申請資格');
      if (reviewNote === null) return; // 使用者按取消
      reviewNote = reviewNote.trim();
    } else {
      const confirmApprove = window.confirm(`確認核准開通【${app.name} (@${app.username})】的 ${app.role} 帳號？\n開通後該同仁即可使用其設定之密碼登入系統。`);
      if (!confirmApprove) return;
    }

    try {
      showToast('正在提交帳號審核結果...', 'info');
      const res = await api.auth.reviewApplication(appId, action, reviewNote);
      if (res.success) {
        showToast(res.message || '審核已完成！', 'success');
        openUserApplicationsModal(currentUserAppFilter);
      } else {
        showToast(res.message || '審核處理失敗', 'error');
      }
    } catch (err) {
      showToast('審核失敗: ' + err.message, 'error');
    }
  }

  // ====================================================
  // 資料載入與統計
  // ====================================================

  async function loadDashboardData() {
    try {
      // 同時讀取清單與統計數據
      const [claimsRes, statsRes] = await Promise.all([
        api.claims.list(state.filters),
        api.claims.stats(state.filters.month)
      ]);

      if (claimsRes.success) {
        state.claims = claimsRes.claims;
        renderClaimsTable();
      }

      if (statsRes.success) {
        state.stats = statsRes.stats;
        renderStats();
      }
    } catch (err) {
      showToast('載入資料失敗: ' + err.message, 'error');
    }
  }

  function resetAllFilters() {
    state.filters.keyword = '';
    state.filters.category = 'all';
    state.filters.status = 'all';
    if (dom.filterKeyword) dom.filterKeyword.value = '';
    if (dom.filterCategory) dom.filterCategory.value = 'all';
    if (dom.filterStatus) dom.filterStatus.value = 'all';
    loadDashboardData();
    showToast('已重設所有篩選條件', 'info');
  }

  function renderStats() {
    if (!state.stats) return;
    const s = state.stats;
    const totalClaims = Number(s.total_claims) || 0;
    const totalAmount = Number(s.total_amount) || 0;
    const pendingCount = Number(s.pending_count) || 0;
    const pendingAmount = Number(s.pending_amount) || 0;
    const disbursedCount = Number(s.disbursed_count) || 0;
    const approvedCount = Number(s.approved_count) || 0;
    const disbursedAmount = Number(s.disbursed_amount) || 0;
    const approvedAmount = Number(s.approved_amount) || 0;

    dom.statTotalAmount.textContent = formatCurrency(totalAmount);
    dom.statTotalCount.textContent = `共 ${totalClaims} 筆申請`;

    dom.statPendingAmount.textContent = formatCurrency(pendingAmount);
    dom.statPendingCount.textContent = `待審核 ${pendingCount} 筆`;

    dom.statDisbursedAmount.textContent = formatCurrency(disbursedAmount + approvedAmount);
    dom.statDisbursedCount.textContent = `已核准/撥款 ${disbursedCount + approvedCount} 筆`;

    // 依當前狀態篩選高亮 KPI 卡片
    if (dom.kpiCardTotal) {
      dom.kpiCardTotal.classList.toggle('active', state.filters.status === 'all' || !state.filters.status);
    }
    if (dom.kpiCardPending) {
      dom.kpiCardPending.classList.toggle('active', state.filters.status === 'pending');
    }
    if (dom.kpiCardDisbursed) {
      dom.kpiCardDisbursed.classList.toggle('active', state.filters.status === 'approved' || state.filters.status === 'disbursed');
    }

    // 類別支出視覺標籤
    dom.breakdownMonthTag.textContent = state.filters.month ? `${state.filters.month} 月份` : '全部期間';
    dom.categoryChipsSummary.innerHTML = '';

    const catClasses = {
      '交通': 'color-traffic',
      '餐食': 'color-meal',
      '設備': 'color-equipment',
      '交際費': 'color-hospitality',
      '清潔及庶務用品': 'color-supplies',
      '其他': 'color-other'
    };

    // 產生「全部類別」快捷切換晶片標籤
    const allPill = document.createElement('div');
    const isAllActive = !state.filters.category || state.filters.category === 'all';
    allPill.className = `cat-summary-pill ${isAllActive ? 'active' : ''}`;
    allPill.setAttribute('role', 'button');
    allPill.setAttribute('title', isAllActive ? '目前已顯示全部類別明細' : '點擊查看全部類別明細');
    allPill.innerHTML = `
      <span class="cat-dot" style="background:#94A3B8;"></span>
      <span class="cat-name">全部類別</span>
      <span class="cat-amount">${formatCurrency(s.total_amount)}</span>
    `;
    allPill.addEventListener('click', () => {
      state.filters.category = 'all';
      if (dom.filterCategory) dom.filterCategory.value = 'all';
      loadDashboardData();
    });
    dom.categoryChipsSummary.appendChild(allPill);

    const categories = Object.keys(s.category_breakdown || {});
    categories.forEach(cat => {
      const amount = s.category_breakdown[cat] || 0;
      const pill = document.createElement('div');
      const isActive = state.filters.category === cat;
      pill.className = `cat-summary-pill ${isActive ? 'active' : ''}`;
      pill.setAttribute('role', 'button');
      pill.setAttribute('title', isActive ? `點擊取消篩選「${cat}」` : `點擊快速過濾「${cat}」明細`);
      pill.innerHTML = `
        <span class="cat-dot ${catClasses[cat] || 'color-other'}"></span>
        <span class="cat-name">${escapeHtml(cat)}</span>
        <span class="cat-amount">${formatCurrency(amount)}</span>
      `;
      pill.addEventListener('click', () => {
        if (state.filters.category === cat) {
          state.filters.category = 'all';
        } else {
          state.filters.category = cat;
        }
        if (dom.filterCategory) dom.filterCategory.value = state.filters.category;
        loadDashboardData();
      });
      dom.categoryChipsSummary.appendChild(pill);
    });
  }

  function renderClaimsTable() {
    dom.claimsTbody.innerHTML = '';

    const hasCategoryFilter = state.filters.category && state.filters.category !== 'all';
    const hasStatusFilter = state.filters.status && state.filters.status !== 'all';
    const hasKeywordFilter = Boolean(state.filters.keyword);
    const isFiltered = hasCategoryFilter || hasStatusFilter || hasKeywordFilter;

    let filterDescList = [];
    if (hasCategoryFilter) filterDescList.push(`類別: ${state.filters.category}`);
    if (hasStatusFilter) {
      const stMap = { pending: '待初審', acc_approved: '待終審', approved: '已核准', disbursed: '已核銷', rejected: '已退回' };
      filterDescList.push(`狀態: ${stMap[state.filters.status] || state.filters.status}`);
    }
    if (hasKeywordFilter) filterDescList.push(`搜尋: "${state.filters.keyword}"`);

    dom.tableRecordCount.textContent = isFiltered
      ? `篩選符合: ${state.claims.length} 筆 (${filterDescList.join(' | ')})`
      : `共 ${state.claims.length} 筆`;

    if (state.claims.length === 0) {
      dom.emptyState.classList.remove('hidden');
      const emptyTitle = dom.emptyState.querySelector('.empty-title');
      const emptyDesc = dom.emptyState.querySelector('.empty-desc');
      if (isFiltered) {
        if (emptyTitle) emptyTitle.textContent = '查無符合條件之零用金申請明細';
        if (emptyDesc) {
          const userScopeNotice = state.user && state.user.role === 'employee'
            ? `<div style="margin-top: 6px; color: #F59E0B; font-size: 12px;">💡 提示：您目前身分為【一般同仁】，僅能查閱本人單據。若需審核或查閱全公司資料，請於右上角切換至【超級管理者】或【財務會計】視角。</div>`
            : '';
          emptyDesc.innerHTML = `
            當前篩選條件下查無任何單據，請調整條件或一鍵清除。<br>
            ${userScopeNotice}
            <button type="button" id="btn-empty-reset" class="btn btn-outline btn-sm" style="margin-top: 10px; cursor: pointer;">
              🔄 清除條件顯示全部單據
            </button>
          `;
          const emptyResetBtn = document.getElementById('btn-empty-reset');
          if (emptyResetBtn) emptyResetBtn.addEventListener('click', resetAllFilters);
        }
      } else {
        if (emptyTitle) emptyTitle.textContent = '查無符合條件之零用金申請';
        if (emptyDesc) emptyDesc.textContent = '請點擊上方「填寫零用金申請」新增單據';
      }
      return;
    }
    dom.emptyState.classList.add('hidden');

    state.claims.forEach(c => {
      const tr = document.createElement('tr');

      // 狀態標籤
      const statusClass = `status-pill status-pill-${c.status}`;
      const statusText = {
        pending: '待初審',
        acc_approved: '待主管終審',
        approved: '主管已核准',
        disbursed: '已撥款核銷',
        rejected: '已退回'
      }[c.status] || c.status;

      // 依身分判斷可執行的動作按鈕
      let actionButtonsHtml = '';
      const isOwner = state.user && c.user_id === state.user.id;
      const canReview = state.user && (state.user.role === 'accountant' || state.user.role === 'admin');
      const canEdit = isOwner && (c.status === 'pending' || c.status === 'rejected');
      const canDelete = (isOwner && c.status === 'pending') || (state.user && state.user.role === 'admin');

      if (canReview) {
        let reviewBtnText = '審核';
        let reviewBtnClass = 'btn-info';
        if (c.status === 'pending') {
          reviewBtnText = state.user.role === 'admin' ? '初審/終審' : '會計初審';
          reviewBtnClass = 'btn-info';
        } else if (c.status === 'acc_approved') {
          reviewBtnText = state.user.role === 'admin' ? '主管終審' : '等待終審';
          reviewBtnClass = state.user.role === 'admin' ? 'btn-warning' : 'btn-outline';
        } else if (c.status === 'approved') {
          reviewBtnText = '撥款核銷';
          reviewBtnClass = 'btn-success';
        } else if (c.status === 'disbursed') {
          reviewBtnText = '檢視單據';
          reviewBtnClass = 'btn-outline';
        }

        actionButtonsHtml += `
          <button class="btn btn-sm ${reviewBtnClass} btn-review" data-id="${c.id}" title="審核/核銷/退回操作">
            ${reviewBtnText}
          </button>
        `;
      }

      if (canEdit) {
        actionButtonsHtml += `
          <button class="btn btn-sm btn-outline btn-edit" data-id="${c.id}" title="修改申請">
            修改
          </button>
        `;
      }

      if (canDelete) {
        actionButtonsHtml += `
          <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${c.id}" title="刪除單據">
            刪除
          </button>
        `;
      }

      if (!actionButtonsHtml) {
        actionButtonsHtml = `<span style="font-size:12px;color:var(--text-dark);">唯讀</span>`;
      }

      tr.innerHTML = `
        <td>
          <span class="claim-no-tag">${escapeHtml(c.claim_no)}</span>
          <span class="claim-date-sub">${escapeHtml(c.expense_date)}</span>
        </td>
        <td>
          <div class="user-name-col">${escapeHtml(c.user_name)}</div>
          <div class="user-dept-col">${escapeHtml(c.department || '')}</div>
        </td>
        <td>
          <span class="cat-badge cat-badge-${escapeHtml(c.category)}">${escapeHtml(c.category)}</span>
        </td>
        <td>
          <div style="font-weight:600;">${escapeHtml(c.item_name)}</div>
          ${c.rejection_reason ? `<div style="font-size:11px;color:#F87171;margin-top:2px;">⚠️ 退件原因: ${escapeHtml(c.rejection_reason)}</div>` : ''}
        </td>
        <td class="text-right">
          ${(() => {
            const hasApproved = c.approved_amount !== undefined && c.approved_amount !== null;
            if (hasApproved && c.approved_amount !== c.amount) {
              return `
                <div class="amount-modified-cell">
                  <span class="approved-amt-text">${formatCurrency(c.approved_amount)}<span class="badge-approved-tag">實批</span></span>
                  <span class="claimed-amt-struck">原申報: ${formatCurrency(c.amount)}</span>
                </div>
              `;
            }
            return `<span class="amount-text">${formatCurrency(hasApproved ? c.approved_amount : c.amount)}</span>`;
          })()}
        </td>
        <td>
          ${c.receipt_no ? `<span style="font-family:monospace;font-size:12px;">${escapeHtml(c.receipt_no)}</span>` : '<span style="color:var(--text-dark);">-</span>'}
          ${c.receipt_url ? `<div><button type="button" class="btn-receipt-preview" data-id="${c.id}" style="border:1px solid rgba(59,130,246,0.3);background:rgba(59,130,246,0.12);color:#93C5FD;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:4px;display:inline-flex;align-items:center;gap:4px;font-weight:500;">🔍 檢視憑證</button></div>` : ''}
        </td>
        <td>
          <span style="font-size:12px;color:var(--text-muted);">${escapeHtml(c.notes || '-')}</span>
        </td>
        <td>
          <span class="${statusClass}">${statusText}</span>
        </td>
        <td class="text-center">
          <div class="table-actions">${actionButtonsHtml}</div>
        </td>
      `;

      dom.claimsTbody.appendChild(tr);
    });

    // 綁定動態生成的按鈕事件
    dom.claimsTbody.querySelectorAll('.btn-receipt-preview').forEach(btn => {
      btn.addEventListener('click', () => openReceiptPreview(btn.dataset.id));
    });
    dom.claimsTbody.querySelectorAll('.btn-review').forEach(btn => {
      btn.addEventListener('click', () => openReviewModal(btn.dataset.id));
    });
    dom.claimsTbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    dom.claimsTbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => handleDeleteClaim(btn.dataset.id));
    });
  }

  // ====================================================
  // Google Sheets 連線狀態與同步
  // ====================================================

  async function checkSheetsStatus() {
    try {
      const res = await api.sheets.getStatus();
      if (res.success) {
        state.sheetsStatus = res.status;
        const ind = dom.sheetsIndicator;
        const text = ind.querySelector('.indicator-text');

        if (res.status.gas_url && dom.cfgGasUrl) {
          dom.cfgGasUrl.value = res.status.gas_url;
        }
        if (res.status.drive_folder_id && dom.cfgDriveFolder) {
          dom.cfgDriveFolder.value = res.status.drive_folder_id;
        }

        if (res.status.enabled) {
          ind.className = 'sheets-indicator connected';
          if (res.status.mode === 'gas' || res.status.gas_configured) {
            text.textContent = `Google 試算表: 已連線 (GAS Webhook)`;
            dom.bannerStatusTitle.textContent = `Google Sheets 串接: Apps Script Webhook 已連線`;
            dom.bannerStatusDesc.textContent = `端點: ${res.status.gas_url_masked || res.status.gas_url} | 上次同步: ${res.status.last_sync_time ? new Date(res.status.last_sync_time).toLocaleString('zh-TW') : '尚未同步'}`;
          } else {
            text.textContent = `Google 試算表: 已連線 (${res.status.sheet_name})`;
            dom.bannerStatusTitle.textContent = `Google Sheets & Drive: GCP 服務帳戶同步中`;
            dom.bannerStatusDesc.textContent = `試算表: ${res.status.sheet_name} | 雲端資料夾: ${res.status.drive_folder || '本機備份'} | 帳號: ${res.status.service_account}`;
          }
        } else {
          ind.className = 'sheets-indicator';
          text.textContent = 'Google 雲端: 本地離線保護模式';
          dom.bannerStatusTitle.textContent = '本地離線保護模式 (尚未串接 Google Sheets / Drive)';
          dom.bannerStatusDesc.textContent = '所有申請與照片均完整保存於本機安全儲存庫中。超級管理者可隨時配置 Google 憑證或 Apps Script 網址啟用自動雲端歸檔。';
        }

      }
    } catch (e) {
      dom.sheetsIndicator.className = 'sheets-indicator error';
      dom.sheetsIndicator.querySelector('.indicator-text').textContent = 'Google Sheets: 狀態異常';
    }
  }

  // ====================================================
  // 零用金表單處理 (新增 / 編輯)
  // ====================================================

  function openCreateModal() {
    state.currentEditingClaimId = null;
    dom.modalClaimTitle.textContent = '填寫零用金申請單';
    dom.claimFormId.value = '';
    dom.claimItem.value = '';
    dom.claimAmount.value = '';
    dom.amountVerbalPreview.textContent = '新台幣 零 元整';
    dom.claimCategory.value = '';
    dom.claimReceiptNo.value = '';
    dom.claimNotes.value = '';
    dom.receiptPreviewWrapper.classList.add('hidden');
    dom.receiptPreviewImg.src = '';
    dom.claimReceiptFile.value = '';
    dom.uploadPrompt.classList.remove('hidden');

    const today = new Date().toISOString().split('T')[0];
    dom.claimDate.value = today;

    dom.modalClaim.classList.add('active');
  }

  function openEditModal(claimId) {
    const claim = state.claims.find(c => c.id === claimId);
    if (!claim) return;

    state.currentEditingClaimId = claimId;
    dom.modalClaimTitle.textContent = `修改零用金申請 (${claim.claim_no})`;
    dom.claimFormId.value = claim.id;
    dom.claimDate.value = claim.expense_date;
    dom.claimCategory.value = claim.category;
    dom.claimItem.value = claim.item_name;
    dom.claimAmount.value = claim.amount;
    dom.amountVerbalPreview.textContent = numberToChineseAmount(claim.amount);
    dom.claimReceiptNo.value = claim.receipt_no || '';
    dom.claimNotes.value = claim.notes || '';

    if (claim.receipt_url) {
      dom.receiptPreviewImg.src = getFullReceiptUrl(claim.receipt_url, claim.id);
      dom.receiptPreviewWrapper.classList.remove('hidden');
      dom.uploadPrompt.classList.add('hidden');
    } else {
      dom.receiptPreviewWrapper.classList.add('hidden');
      dom.receiptPreviewImg.src = '';
      dom.uploadPrompt.classList.remove('hidden');
    }

    dom.modalClaim.classList.add('active');
  }

  async function handleClaimSubmit(e) {
    e.preventDefault();

    const amount = Number(dom.claimAmount.value);
    if (isNaN(amount) || amount <= 0) {
      showToast('請輸入大於 0 的金額', 'error');
      return;
    }

    const payload = {
      expense_date: dom.claimDate.value,
      category: dom.claimCategory.value,
      item_name: dom.claimItem.value.trim(),
      amount: amount,
      receipt_no: dom.claimReceiptNo.value.trim(),
      notes: dom.claimNotes.value.trim(),
      receipt_url: dom.receiptPreviewImg.src || ''
    };

    try {
      if (state.currentEditingClaimId) {
        const res = await api.claims.update(state.currentEditingClaimId, payload);
        showToast(res.message || '申請單已成功修改！', 'success');
      } else {
        const res = await api.claims.create(payload);
        showToast(res.message || '零用金申請已成功送出！', 'success');
      }
      dom.modalClaim.classList.remove('active');
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDeleteClaim(claimId) {
    const claim = state.claims.find(c => c.id === claimId);
    if (!claim) return;

    if (!confirm(`確定要刪除申請單「${claim.claim_no} - ${claim.item_name}」嗎？`)) {
      return;
    }

    try {
      const res = await api.claims.delete(claimId);
      showToast(res.message || '申請單已刪除', 'success');
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ====================================================
  // 審核與撥款操作 (會計與管理員)
  // ====================================================

  function updateReviewDiffTag(originalAmount, approvedAmount) {
    if (!dom.reviewDiffTag) return;
    if (approvedAmount === '' || isNaN(approvedAmount)) {
      dom.reviewDiffTag.className = 'review-diff-tag diff-tag-equal';
      dom.reviewDiffTag.innerHTML = '<span>請輸入金額</span>';
      if (dom.reviewAmountVerbal) dom.reviewAmountVerbal.textContent = '-';
      return;
    }

    const orig = Number(originalAmount) || 0;
    const appr = Math.round(Number(approvedAmount));
    const diff = appr - orig;

    if (dom.reviewAmountVerbal) {
      dom.reviewAmountVerbal.textContent = numberToChineseAmount(appr);
    }

    if (diff === 0) {
      dom.reviewDiffTag.className = 'review-diff-tag diff-tag-equal';
      dom.reviewDiffTag.innerHTML = '<span>✓ 全額核准 (無差額)</span>';
    } else if (diff < 0) {
      dom.reviewDiffTag.className = 'review-diff-tag diff-tag-decrease';
      dom.reviewDiffTag.innerHTML = `<span>少核准 NT$ ${Math.abs(diff).toLocaleString('en-US')}</span>`;
    } else {
      dom.reviewDiffTag.className = 'review-diff-tag diff-tag-increase';
      dom.reviewDiffTag.innerHTML = `<span>超額核准 +NT$ ${diff.toLocaleString('en-US')}</span>`;
    }
  }

  function openReviewModal(claimId) {
    const claim = state.claims.find(c => c.id === claimId);
    if (!claim) return;

    state.currentReviewingClaimId = claimId;
    dom.reviewClaimNo.textContent = claim.claim_no;
    dom.reviewUserName.textContent = `${claim.user_name} (${claim.department || '未分配'})`;
    dom.reviewItemName.textContent = `[${claim.category}] ${claim.item_name}`;
    dom.reviewAmount.textContent = formatCurrency(claim.amount);
    dom.reviewReason.value = claim.rejection_reason || '';

    // 預設批准金額：若已核定過則帶入，否則帶入原申報金額
    const currentApprovedAmt = claim.approved_amount !== undefined && claim.approved_amount !== null
      ? claim.approved_amount
      : claim.amount;

    if (dom.reviewApprovedAmount) {
      dom.reviewApprovedAmount.value = currentApprovedAmt;
      updateReviewDiffTag(claim.amount, currentApprovedAmt);
    }

    // 發票憑證檢視列控制
    if (dom.reviewReceiptRow) {
      dom.reviewReceiptRow.style.display = claim.receipt_url ? 'flex' : 'none';
    }

    // 二階段審核橫幅提示與按鈕動態控制
    const userRole = state.user ? state.user.role : 'employee';
    const banner = dom.reviewWorkflowBanner;

    if (banner) {
      banner.style.display = 'block';
    }

    // 預設按鈕顯示狀態
    dom.btnActionReject.style.display = 'inline-flex';
    dom.btnActionApprove.style.display = 'inline-flex';
    dom.btnActionDisburse.style.display = 'inline-flex';
    dom.btnActionReject.textContent = '審核退回';

    if (claim.status === 'pending') {
      if (userRole === 'accountant') {
        if (banner) {
          banner.className = 'review-workflow-banner banner-step-accountant mb-3';
          banner.innerHTML = '<strong>階段 1/2：會計初審中</strong><br>審查單據發票與金額無誤後，請點選「初審通過（送交主管）」。通過後將由陳總監進行終審，終審核准前無法撥款。';
        }
        dom.btnActionApprove.textContent = '初審通過（送交主管）';
        dom.btnActionApprove.className = 'btn btn-primary';
        dom.btnActionDisburse.style.display = 'none'; // 會計初審階段不可撥款
      } else if (userRole === 'admin') {
        if (banner) {
          banner.className = 'review-workflow-banner banner-step-admin mb-3';
          banner.innerHTML = '<strong>階段 1/2：待初審</strong><br>此單據尚未經會計初審。身為超級使用者（陳總監），您可直接執行終審核准或退回。';
        }
        dom.btnActionApprove.textContent = '主管終審核准（准予撥款）';
        dom.btnActionApprove.className = 'btn btn-success';
        dom.btnActionDisburse.style.display = 'none'; // 尚未核准前不可直接撥款
      }
    } else if (claim.status === 'acc_approved') {
      if (userRole === 'accountant') {
        if (banner) {
          banner.className = 'review-workflow-banner banner-step-waiting mb-3';
          banner.innerHTML = '<strong>階段 2/2：等待主管終審</strong><br>此單據已通過會計初審，正在等待超級使用者（陳總監）終審核准。在主管核准前暫無法執行撥款。';
        }
        dom.btnActionApprove.style.display = 'none';
        dom.btnActionDisburse.style.display = 'none'; // 未終審禁止撥款
        dom.btnActionReject.textContent = '退回修改';
      } else if (userRole === 'admin') {
        if (banner) {
          banner.className = 'review-workflow-banner banner-step-admin mb-3';
          banner.innerHTML = '<strong>階段 2/2：會計已完成初審</strong><br>會計已確認憑證與金額無誤。請陳總監進行最後終審核定，核准後即可由會計/出納執行撥款。';
        }
        dom.btnActionApprove.textContent = '主管終審核准（准予撥款）';
        dom.btnActionApprove.className = 'btn btn-success';
        dom.btnActionDisburse.style.display = 'none';
      }
    } else if (claim.status === 'approved') {
      if (banner) {
        banner.className = 'review-workflow-banner banner-step-approved mb-3';
        banner.innerHTML = '<strong>二階段審核完成：主管已核准</strong><br>此單據已通過會計初審與主管終審，出納/會計人員現在可執行實際撥款核銷。';
      }
      dom.btnActionApprove.style.display = 'none';
      dom.btnActionDisburse.textContent = '確認已撥款核銷 ✓';
      dom.btnActionDisburse.className = 'btn btn-success';
    } else if (claim.status === 'disbursed') {
      if (banner) {
        banner.className = 'review-workflow-banner banner-step-disbursed mb-3';
        banner.innerHTML = '<strong>已撥款核銷結案</strong><br>此單據款項已全數撥付完畢。';
      }
      dom.btnActionApprove.style.display = 'none';
      dom.btnActionDisburse.style.display = 'none';
      dom.btnActionReject.style.display = 'none';
    } else if (claim.status === 'rejected') {
      if (banner) {
        banner.className = 'review-workflow-banner banner-step-rejected mb-3';
        banner.innerHTML = `<strong>此單據已被退回</strong><br>退件原因：${escapeHtml(claim.rejection_reason || '無')}`;
      }
      dom.btnActionDisburse.style.display = 'none';
      dom.btnActionApprove.textContent = userRole === 'admin' ? '重審並主管核准' : '重新初審通過';
      dom.btnActionReject.style.display = 'none';
    }

    dom.modalReview.classList.add('active');
  }

  async function handleReviewAction(actionType) {
    if (!state.currentReviewingClaimId) return;
    const claim = state.claims.find(c => c.id === state.currentReviewingClaimId);
    if (!claim) return;

    const reason = dom.reviewReason.value.trim();
    if (actionType === 'rejected' && !reason) {
      showToast('審核退回時必須填寫退件原因', 'error');
      dom.reviewReason.focus();
      return;
    }

    // 決定實際送至後端的目標狀態
    let targetStatus = actionType;
    if (actionType === 'approved') {
      if (state.user && state.user.role === 'accountant') {
        // 會計只能進行初審 (acc_approved)
        targetStatus = 'acc_approved';
      } else {
        // 主管 (admin) 進行終審核定 (approved)
        targetStatus = 'approved';
      }
    }

    let approvedAmount = null;
    if (dom.reviewApprovedAmount && (targetStatus === 'acc_approved' || targetStatus === 'approved' || targetStatus === 'disbursed')) {
      const val = dom.reviewApprovedAmount.value.trim();
      if (!val || isNaN(val) || Number(val) < 0) {
        showToast('請輸入合法的批准金額 (大於或等於 0)', 'error');
        dom.reviewApprovedAmount.focus();
        return;
      }
      approvedAmount = Math.round(Number(val));
    }

    try {
      showToast('正在提交審核狀態...', 'info');
      const res = await api.claims.updateStatus(state.currentReviewingClaimId, targetStatus, reason, approvedAmount);
      showToast(res.message || '審核狀態已更新！', 'success');
      dom.modalReview.classList.remove('active');
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ====================================================
  // 金額異動稽核 Log 檔檢視邏輯
  // ====================================================

  let cachedAuditLogs = [];

  async function openAuditLogsModal() {
    if (!dom.modalAuditLogs) return;
    dom.modalAuditLogs.classList.add('active');
    dom.auditLogsContainer.innerHTML = '<div class="audit-log-loading">正在讀取伺服器實體 Log 檔...</div>';

    try {
      const res = await api.claims.getApprovalLogs(100);
      if (res.success) {
        cachedAuditLogs = res.logs || [];
        if (res.fileInfo && dom.auditLogFileMeta) {
          dom.auditLogFileMeta.innerHTML = `實體路徑: <code>${escapeHtml(res.fileInfo.filePath)}</code> | 大小: <b>${res.fileInfo.sizeFormatted}</b> | 最後更新: ${res.fileInfo.modifiedAt ? new Date(res.fileInfo.modifiedAt).toLocaleString('zh-TW') : '無'}`;
        }
        renderAuditLogs(cachedAuditLogs);
      } else {
        dom.auditLogsContainer.innerHTML = `<div class="audit-log-loading" style="color:#EF4444;">載入失敗: ${escapeHtml(res.message)}</div>`;
      }
    } catch (err) {
      dom.auditLogsContainer.innerHTML = `<div class="audit-log-loading" style="color:#EF4444;">讀取 Log 檔失敗: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderAuditLogs(logs) {
    if (!dom.auditLogsContainer) return;
    if (!logs || logs.length === 0) {
      dom.auditLogsContainer.innerHTML = '<div class="audit-log-loading" style="color:var(--text-muted);">目前尚無金額異動 Log 紀錄 (每次會計/管理員審核或修改金額時將自動記錄於此)</div>';
      if (dom.auditLogsCountSummary) dom.auditLogsCountSummary.textContent = '共 0 筆紀錄';
      return;
    }

    if (dom.auditLogsCountSummary) {
      dom.auditLogsCountSummary.textContent = `顯示最新 ${logs.length} 筆 Log 紀錄`;
    }
    dom.auditLogsContainer.innerHTML = '';

    logs.forEach(item => {
      const card = document.createElement('div');
      let actionClass = '';
      if (item.action.includes('通過') || item.action.includes('核准')) actionClass = 'action-approved';
      else if (item.action.includes('撥款')) actionClass = 'action-disbursed';
      else if (item.action.includes('退回')) actionClass = 'action-rejected';

      let diffBadge = '';
      if (item.diff) {
        if (item.diff.includes('-') || item.diff.includes('少')) {
          diffBadge = `<span class="log-diff-indicator diff-minus">${escapeHtml(item.diff)}</span>`;
        } else if (item.diff.includes('+') || item.diff.includes('超')) {
          diffBadge = `<span class="log-diff-indicator diff-plus">${escapeHtml(item.diff)}</span>`;
        } else {
          diffBadge = `<span class="log-diff-indicator diff-none">${escapeHtml(item.diff)}</span>`;
        }
      }

      card.className = `audit-log-item-card ${actionClass}`;
      card.innerHTML = `
        <div class="log-item-top">
          <div>
            <span class="log-claim-no">${escapeHtml(item.claim_no || '-')}</span>
            <span class="log-operator">操作人: ${escapeHtml(item.operator || '-')}</span>
          </div>
          <div>
            <span class="log-action-tag">${escapeHtml(item.action || '記錄')}</span>
            <span class="log-time-badge" style="margin-left: 8px;">${escapeHtml(item.timestamp || '')}</span>
          </div>
        </div>
        <div class="log-item-amounts">
          <span class="log-amt-original">申報: ${escapeHtml(item.claim_amount || '-')}</span>
          <span class="log-amt-arrow">➔</span>
          <span class="log-amt-approved">實批: ${escapeHtml(item.amount_change || '-')}</span>
          ${diffBadge}
          <span style="color:var(--text-muted);font-size:11px;margin-left:auto;">申請人: ${escapeHtml(item.applicant || '-')} (IP: ${escapeHtml(item.ip || '-')})</span>
        </div>
        ${item.reason && item.reason !== '無' ? `<div class="log-item-note">📝 備註原因: ${escapeHtml(item.reason)}</div>` : ''}
        <div class="log-item-raw">${escapeHtml(item.raw || '')}</div>
      `;
      dom.auditLogsContainer.appendChild(card);
    });
  }

  function filterAuditLogs() {
    if (!dom.filterAuditLogKw) return;
    const kw = dom.filterAuditLogKw.value.trim().toLowerCase();
    if (!kw) {
      renderAuditLogs(cachedAuditLogs);
      return;
    }
    const filtered = cachedAuditLogs.filter(l => {
      return (l.claim_no && l.claim_no.toLowerCase().includes(kw)) ||
             (l.operator && l.operator.toLowerCase().includes(kw)) ||
             (l.action && l.action.toLowerCase().includes(kw)) ||
             (l.reason && l.reason.toLowerCase().includes(kw)) ||
             (l.applicant && l.applicant.toLowerCase().includes(kw)) ||
             (l.raw && l.raw.toLowerCase().includes(kw));
    });
    renderAuditLogs(filtered);
  }

  // ====================================================
  // 報表匯出邏輯 (Excel & CSV)
  // ====================================================

  async function handleExport(format) {
    try {
      showToast(`正在產生 ${format.toUpperCase()} 報表，請稍候...`, 'info');
      dom.exportMenu.classList.remove('open');
      dom.btnExportDropdown.parentElement.classList.remove('open');

      let blob;
      let filename;
      const monthStr = state.filters.month || '全部';
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      if (format === 'excel') {
        blob = await api.export.excel(state.filters);
        // 防禦機制：若因瀏覽器沙盒限制降級為 CSV，自動更名為 .csv 避免 Excel 報檔案無效或格式不符
        if (blob && blob.type && blob.type.includes('csv')) {
          filename = `零用金支出明細報表_${monthStr}_${timestamp}.csv`;
          showToast('系統已自動切換為 UTF-8 BOM CSV 格式下載', 'warning');
        } else {
          filename = `零用金支出明細報表_${monthStr}_${timestamp}.xlsx`;
        }
      } else {
        blob = await api.export.csv(state.filters);
        filename = `零用金支出明細_${monthStr}_${timestamp}.csv`;
      }

      // 觸發前端自動下載
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      showToast(`報表已成功下載：${filename}`, 'success');
    } catch (err) {
      showToast('匯出失敗: ' + err.message, 'error');
    }
  }

  // ====================================================
  // 事件綁定
  // ====================================================

  function bindEvents() {
    // 登入處理邏輯
    async function executeLogin(username, password) {
      if (!username || !password) {
        showToast('請輸入帳號與密碼', 'error');
        return;
      }

      try {
        dom.btnLoginSubmit.disabled = true;
        dom.btnLoginSubmit.querySelector('span').textContent = '登入驗證中...';

        const res = await api.auth.login(username, password);
        if (res.success) {
          state.user = res.user;
          showToast(`歡迎回來，${res.user.name}！`, 'success');
          switchToMainView();
        } else {
          showToast(res.message || '登入失敗', 'error');
        }
      } catch (err) {
        console.error('Login error:', err);
        const msg = (err.message && err.message.includes('Failed to fetch') && !api.isCloudMode)
          ? '無法連線至後端伺服器，請確認後端已啟動 (http://localhost:3050)'
          : (err.message || '登入失敗，請確認帳號與密碼');
        showToast(msg, 'error');
      } finally {
        dom.btnLoginSubmit.disabled = false;
        dom.btnLoginSubmit.querySelector('span').textContent = '登入系統';
      }
    }

    // 0. 登入 / 帳號申請頁籤切換邏輯
    function switchAuthTab(tab) {
      const isReg = tab === 'register';
      if (dom.tabBtnLogin) dom.tabBtnLogin.classList.toggle('active', !isReg);
      if (dom.tabBtnRegister) dom.tabBtnRegister.classList.toggle('active', isReg);
      if (dom.authPanelLogin) {
        dom.authPanelLogin.classList.toggle('active', !isReg);
        dom.authPanelLogin.classList.toggle('hidden', isReg);
        dom.authPanelLogin.style.display = !isReg ? 'block' : 'none';
      }
      if (dom.authPanelRegister) {
        dom.authPanelRegister.classList.toggle('active', isReg);
        dom.authPanelRegister.classList.toggle('hidden', !isReg);
        dom.authPanelRegister.style.display = isReg ? 'block' : 'none';
      }
    }

    if (dom.tabBtnLogin) dom.tabBtnLogin.addEventListener('click', () => switchAuthTab('login'));
    if (dom.tabBtnRegister) dom.tabBtnRegister.addEventListener('click', () => switchAuthTab('register'));
    
    const linkGoReg = document.getElementById('link-goto-register') || document.getElementById('link-go-to-register');
    if (linkGoReg) {
      linkGoReg.addEventListener('click', (e) => {
        e.preventDefault();
        switchAuthTab('register');
      });
    }

    const linkBackLog = document.getElementById('link-back-to-login');
    if (linkBackLog) {
      linkBackLog.addEventListener('click', (e) => {
        e.preventDefault();
        switchAuthTab('login');
      });
    }

    // 0-1. 帳號申請送出表單
    if (dom.registerForm) {
      dom.registerForm.addEventListener('submit', async e => {
        e.preventDefault();
        const username = dom.regUsername.value.trim();
        const name = dom.regName.value.trim();
        const password = dom.regPassword.value;
        const passwordConfirm = dom.regPasswordConfirm.value;
        const department = dom.regDepartment.value.trim();
        const role = dom.regRole.value;
        const applyReason = dom.regReason.value.trim();

        if (!username || !name || !password || !passwordConfirm) {
          showToast('請填寫所有必填欄位', 'error');
          return;
        }

        if (password.length < 6) {
          showToast('密碼長度至少需 6 個字元', 'error');
          dom.regPassword.focus();
          return;
        }

        if (password !== passwordConfirm) {
          showToast('兩次輸入的密碼不一致，請重新確認', 'error');
          dom.regPasswordConfirm.focus();
          return;
        }

        try {
          dom.btnSubmitRegister.disabled = true;
          dom.btnSubmitRegister.innerHTML = '<span>送出申請中...</span>';

          const res = await api.auth.applyAccount({
            username,
            name,
            password,
            department,
            role,
            applyReason
          });

          if (res.success) {
            showToast(res.message || '帳號申請已送出！請等待管理者核准。', 'success');
            dom.registerForm.reset();
            switchAuthTab('login');
          } else {
            showToast(res.message || '申請送出失敗', 'error');
          }
        } catch (err) {
          console.error('Register error:', err);
          showToast(err.message || '送出申請失敗', 'error');
        } finally {
          dom.btnSubmitRegister.disabled = false;
          dom.btnSubmitRegister.innerHTML = '<span>送出帳號開通申請</span>';
        }
      });
    }

    // 0-2. 管理者帳號審核彈窗與篩選頁籤
    if (dom.btnUserApplications) {
      dom.btnUserApplications.addEventListener('click', () => {
        openUserApplicationsModal('all');
      });
    }

    if (dom.btnRefreshUserApps) {
      dom.btnRefreshUserApps.addEventListener('click', () => {
        openUserApplicationsModal(currentUserAppFilter);
      });
    }

    if (dom.btnSyncUsersSheet) {
      dom.btnSyncUsersSheet.addEventListener('click', async () => {
        try {
          dom.btnSyncUsersSheet.disabled = true;
          const originalText = dom.btnSyncUsersSheet.innerHTML;
          dom.btnSyncUsersSheet.innerHTML = '<span>⏳ 同步中...</span>';
          showToast('正在將人員權限與帳號名冊同步至 Google 試算表...', 'info');

          const res = await api.auth.syncUsersSheet();
          if (res.success) {
            showToast(res.message || '人員權限名冊已成功同步至 Google 試算表！', 'success');
          } else {
            showToast(res.message || '同步失敗', 'error');
          }
        } catch (err) {
          console.error('Sync users sheet error:', err);
          showToast('同步失敗: ' + err.message, 'error');
        } finally {
          dom.btnSyncUsersSheet.disabled = false;
          dom.btnSyncUsersSheet.innerHTML = '📊 同步至 Google Sheet';
        }
      });
    }

    if (dom.modalUserApplications) {
      dom.modalUserApplications.querySelectorAll('.app-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          dom.modalUserApplications.querySelectorAll('.app-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentUserAppFilter = btn.dataset.status;
          renderUserApplicationsList(currentUserAppFilter);
        });
      });
    }

    // 1. 登入表單提交
    dom.loginForm.addEventListener('submit', e => {
      e.preventDefault();
      const username = dom.inputLoginUser.value.trim();
      const password = dom.inputLoginPass.value.trim();
      executeLogin(username, password);
    });

    // 2. 登出
    dom.btnLogout.addEventListener('click', () => {
      api.clearSession();
      state.user = null;
      showToast('您已安全登出系統', 'info');
      switchToLoginView();
    });

    // 5. 篩選工具列事件
    let searchTimer = null;
    dom.filterKeyword.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filters.keyword = dom.filterKeyword.value.trim();
        loadDashboardData();
      }, 250);
    });

    const handleMonthChange = () => {
      state.filters.month = dom.filterMonth.value;
      loadDashboardData();
    };
    dom.filterMonth.addEventListener('change', handleMonthChange);
    dom.filterMonth.addEventListener('input', handleMonthChange);

    dom.filterCategory.addEventListener('change', () => {
      state.filters.category = dom.filterCategory.value;
      loadDashboardData();
    });

    dom.filterStatus.addEventListener('change', () => {
      state.filters.status = dom.filterStatus.value;
      loadDashboardData();
    });

    if (dom.selectRoleSwitch) {
      dom.selectRoleSwitch.addEventListener('change', () => {
        switchActiveRole(dom.selectRoleSwitch.value);
      });
    }

    if (dom.btnResetFilters) {
      dom.btnResetFilters.addEventListener('click', resetAllFilters);
    }

    // KPI 統計卡片點擊連動篩選狀態
    if (dom.kpiCardTotal) {
      dom.kpiCardTotal.addEventListener('click', () => {
        state.filters.status = 'all';
        if (dom.filterStatus) dom.filterStatus.value = 'all';
        loadDashboardData();
      });
    }

    if (dom.kpiCardPending) {
      dom.kpiCardPending.addEventListener('click', () => {
        state.filters.status = state.filters.status === 'pending' ? 'all' : 'pending';
        if (dom.filterStatus) dom.filterStatus.value = state.filters.status;
        loadDashboardData();
      });
    }

    if (dom.kpiCardDisbursed) {
      dom.kpiCardDisbursed.addEventListener('click', () => {
        state.filters.status = (state.filters.status === 'disbursed' || state.filters.status === 'approved') ? 'all' : 'disbursed';
        if (dom.filterStatus) dom.filterStatus.value = state.filters.status;
        loadDashboardData();
      });
    }

    const triggerRefresh = () => {
      if (dom.btnRefreshList) {
        dom.btnRefreshList.classList.add('btn-spin-anim');
        setTimeout(() => dom.btnRefreshList && dom.btnRefreshList.classList.remove('btn-spin-anim'), 600);
      }
      if (dom.btnRefreshListMini) {
        dom.btnRefreshListMini.classList.add('btn-spin-anim');
        setTimeout(() => dom.btnRefreshListMini && dom.btnRefreshListMini.classList.remove('btn-spin-anim'), 600);
      }
      loadDashboardData();
      showToast('已重新整理資料清單', 'info');
    };

    if (dom.btnRefreshList) {
      dom.btnRefreshList.addEventListener('click', triggerRefresh);
    }
    if (dom.btnRefreshListMini) {
      dom.btnRefreshListMini.addEventListener('click', triggerRefresh);
    }

    // 6. 匯出報表下拉切換
    dom.btnExportDropdown.addEventListener('click', e => {
      e.stopPropagation();
      dom.btnExportDropdown.parentElement.classList.toggle('open');
    });
    document.addEventListener('click', () => {
      dom.btnExportDropdown.parentElement.classList.remove('open');
    });
    dom.btnExportExcel.addEventListener('click', () => handleExport('excel'));
    dom.btnExportCsv.addEventListener('click', () => handleExport('csv'));
    dom.btnExportReceiptsA4.addEventListener('click', openA4ReceiptsModal);
    if (dom.btnQuickReceiptsA4) {
      dom.btnQuickReceiptsA4.addEventListener('click', openA4ReceiptsModal);
    }
    if (dom.a4LayoutMode) {
      dom.a4LayoutMode.addEventListener('change', () => {
        renderA4Receipts(parseInt(dom.a4LayoutMode.value, 10));
      });
    }
    if (dom.btnDoPrintA4) {
      dom.btnDoPrintA4.addEventListener('click', () => {
        window.print();
      });
    }

    // 6.5 AI 發票辨識建單彈窗事件
    if (dom.btnOpenAiOcrModal) {
      dom.btnOpenAiOcrModal.addEventListener('click', () => {
        openAiOcrModal(true);
      });
    }

    if (dom.btnToggleGeminiKey) {
      dom.btnToggleGeminiKey.addEventListener('click', () => {
        dom.geminiKeyPanel.classList.toggle('hidden');
      });
    }

    if (dom.btnSaveGeminiKey) {
      dom.btnSaveGeminiKey.addEventListener('click', () => {
        const key = dom.inputGeminiApiKey.value.trim();
        localStorage.setItem('gemini_api_key', key);
        showToast(key ? 'Gemini API Key 已儲存至瀏覽器！已啟用真實多模態神經網路' : '已清除 API Key，將切換為智慧展示模式', 'success');
        dom.geminiKeyPanel.classList.add('hidden');
      });
    }

    // 切換金鑰顯示 / 隱藏 (眼睛按鈕)
    const btnToggleKeyVis = document.getElementById('btn-toggle-key-visibility');
    if (btnToggleKeyVis && dom.inputGeminiApiKey) {
      btnToggleKeyVis.addEventListener('click', () => {
        const isPassword = dom.inputGeminiApiKey.type === 'password';
        dom.inputGeminiApiKey.type = isPassword ? 'text' : 'password';
        btnToggleKeyVis.textContent = isPassword ? '🔒' : '👁️';
      });
    }

    // 點擊整個上傳拖曳區即可開啟檔案選擇
    if (dom.aiDropzone && dom.aiFileInput) {
      dom.aiDropzone.addEventListener('click', e => {
        if (e.target.closest('#btn-sample-ai-photo') || e.target.closest('#btn-browse-ai-photo')) return;
        dom.aiFileInput.click();
      });
    }

    // 瀏覽本機檔案按鈕
    if (dom.btnBrowseAiPhoto && dom.aiFileInput) {
      dom.btnBrowseAiPhoto.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.aiFileInput.click();
      });
      dom.aiFileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) handleAiImageUpload(file);
      });
    }

    // 載入測試範本發票照片
    if (dom.btnSampleAiPhoto) {
      dom.btnSampleAiPhoto.addEventListener('click', () => {
        showToast('正在繪製測試發票照片 (含全家便利商店發票與台灣大車隊收據)...', 'info');
        const sampleBase64 = generateSampleReceiptImage();
        handleAiImageUpload(sampleBase64);
      });
    }

    // 拖曳上傳
    if (dom.aiDropzone) {
      dom.aiDropzone.addEventListener('dragover', e => {
        e.preventDefault();
        dom.aiDropzone.classList.add('dragover');
      });
      dom.aiDropzone.addEventListener('dragleave', e => {
        e.preventDefault();
        dom.aiDropzone.classList.remove('dragover');
      });
      dom.aiDropzone.addEventListener('drop', e => {
        e.preventDefault();
        dom.aiDropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleAiImageUpload(e.dataTransfer.files[0]);
        }
      });
    }

    // 剪貼簿貼上照片 (Ctrl + V)
    window.addEventListener('paste', e => {
      if (!dom.modalAiOcr || !dom.modalAiOcr.classList.contains('active')) return;
      const items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData))?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          showToast('已由剪貼簿貼上照片，開始進行 AI 辨識...', 'info');
          handleAiImageUpload(blob);
          break;
        }
      }
    });

    // 重新上傳
    if (dom.btnAiReupload) {
      dom.btnAiReupload.addEventListener('click', () => {
        dom.aiStepResults.classList.add('hidden');
        dom.aiStepUpload.classList.remove('hidden');
        if (dom.aiFileInput) dom.aiFileInput.value = '';
      });
    }

    // 手動新增一張
    if (dom.btnAddManualReceipt) {
      dom.btnAddManualReceipt.addEventListener('click', addManualReceiptCard);
    }

    // 一鍵批次送出
    if (dom.btnSubmitBatchClaims) {
      dom.btnSubmitBatchClaims.addEventListener('click', submitBatchClaims);
    }

    // 7. 新增零用金彈窗
    dom.btnOpenCreateModal.addEventListener('click', openCreateModal);
    dom.formClaim.addEventListener('submit', handleClaimSubmit);

    // 金額輸入即時中文大寫換算
    dom.claimAmount.addEventListener('input', () => {
      const val = Number(dom.claimAmount.value);
      dom.amountVerbalPreview.textContent = numberToChineseAmount(val);
    });

    // 憑證照片選擇與預覽 (Base64)
    dom.claimReceiptFile.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        showToast('圖片大小不得超過 5MB', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = ev => {
        dom.receiptPreviewImg.src = ev.target.result;
        dom.receiptPreviewWrapper.classList.remove('hidden');
        dom.uploadPrompt.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    });

    dom.btnRemoveReceipt.addEventListener('click', () => {
      dom.receiptPreviewImg.src = '';
      dom.receiptPreviewWrapper.classList.add('hidden');
      dom.uploadPrompt.classList.remove('hidden');
      dom.claimReceiptFile.value = '';
    });

    // 8. 審核操作按鈕與批准金額即時互動
    if (dom.reviewApprovedAmount) {
      dom.reviewApprovedAmount.addEventListener('input', () => {
        const claim = state.claims.find(c => c.id === state.currentReviewingClaimId);
        const origAmt = claim ? claim.amount : 0;
        updateReviewDiffTag(origAmt, dom.reviewApprovedAmount.value);
      });
    }

    if (dom.btnReviewResetAmount) {
      dom.btnReviewResetAmount.addEventListener('click', () => {
        const claim = state.claims.find(c => c.id === state.currentReviewingClaimId);
        if (claim && dom.reviewApprovedAmount) {
          dom.reviewApprovedAmount.value = claim.amount;
          updateReviewDiffTag(claim.amount, claim.amount);
          showToast(`已還原為原申報金額 NT$ ${claim.amount.toLocaleString('en-US')}`, 'info');
        }
      });
    }

    if (dom.btnOpenLogsFromReview) {
      dom.btnOpenLogsFromReview.addEventListener('click', () => {
        openAuditLogsModal();
      });
    }

    if (dom.btnReviewViewReceipt) {
      dom.btnReviewViewReceipt.addEventListener('click', () => {
        if (state.currentReviewingClaimId) {
          openReceiptPreview(state.currentReviewingClaimId);
        }
      });
    }

    if (dom.receiptViewerOpenLink) {
      dom.receiptViewerOpenLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.currentPreviewingClaim) {
          openReceiptInNewTab(state.currentPreviewingClaim);
        } else if (state.currentReviewingClaimId) {
          const c = state.claims.find(item => item.id === state.currentReviewingClaimId);
          if (c) openReceiptInNewTab(c);
        }
      });
    }

    dom.btnActionReject.addEventListener('click', () => handleReviewAction('rejected'));
    dom.btnActionApprove.addEventListener('click', () => handleReviewAction('approved'));
    dom.btnActionDisburse.addEventListener('click', () => handleReviewAction('disbursed'));

    // 8-1. 金額異動 Log 檔彈窗操作
    if (dom.btnApprovalLogs) {
      dom.btnApprovalLogs.addEventListener('click', () => {
        openAuditLogsModal();
      });
    }

    if (dom.filterAuditLogKw) {
      dom.filterAuditLogKw.addEventListener('input', filterAuditLogs);
    }

    if (dom.btnRefreshAuditLogs) {
      dom.btnRefreshAuditLogs.addEventListener('click', openAuditLogsModal);
    }

    if (dom.btnDownloadAuditLogs) {
      dom.btnDownloadAuditLogs.addEventListener('click', async () => {
        try {
          showToast('正在下載實體 Log 檔 (approval_changes.log)...', 'info');
          const blob = await api.claims.downloadApprovalLogs();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `approval_changes_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.log`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          showToast('Log 檔已成功下載！', 'success');
        } catch (err) {
          showToast('下載 Log 檔失敗: ' + err.message, 'error');
        }
      });
    }

    // 9. Google Sheets 整合面板
    dom.btnSheetsPanel.addEventListener('click', () => {
      dom.modalSheets.classList.add('active');
      checkSheetsStatus();
    });
    dom.sheetsIndicator.addEventListener('click', () => {
      if (state.user && state.user.role !== 'employee') {
        dom.modalSheets.classList.add('active');
        checkSheetsStatus();
      }
    });

    // 模式分頁切換
    document.querySelectorAll('.sheets-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sheets-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sheets-tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetPane = document.getElementById(btn.dataset.tab);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // 立即全量同步按鈕
    dom.btnSyncNow.addEventListener('click', async () => {
      try {
        dom.btnSyncNow.disabled = true;
        showToast('正在與 Google Sheets 進行全量同步...', 'info');
        const res = await api.sheets.syncAll();
        showToast(res.message || '同步完成！', 'success');
        checkSheetsStatus();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        dom.btnSyncNow.disabled = false;
      }
    });

    // GAS 測試連線
    if (dom.btnTestGas) {
      dom.btnTestGas.addEventListener('click', async () => {
        const gasUrl = dom.cfgGasUrl.value.trim();
        if (!gasUrl) {
          showToast('請輸入 Google Apps Script 網址', 'error');
          return;
        }
        try {
          dom.btnTestGas.disabled = true;
          showToast('正在測試連線至 Google Apps Script Web App...', 'info');
          const res = await api.sheets.testConnection(gasUrl);
          if (res.success) {
            showToast(res.message, 'success');
            checkSheetsStatus();
          } else {
            showToast(res.message, 'error');
          }
        } catch (err) {
          showToast('測試失敗: ' + err.message, 'error');
        } finally {
          dom.btnTestGas.disabled = false;
        }
      });
    }

    // 儲存 GAS Web App 網址設定
    if (dom.formGasConfig) {
      dom.formGasConfig.addEventListener('submit', async e => {
        e.preventDefault();
        const gasUrl = dom.cfgGasUrl.value.trim();
        if (!gasUrl) {
          showToast('請填寫 Google Apps Script 網址', 'error');
          return;
        }
        try {
          showToast('正在儲存設定並驗證連線...', 'info');
          const res = await api.sheets.updateConfig({ gas_url: gasUrl });
          showToast(res.message, res.success ? 'success' : 'error');
          checkSheetsStatus();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    // 查看 Code.gs 腳本
    if (dom.btnViewCodeGs) {
      dom.btnViewCodeGs.addEventListener('click', async () => {
        try {
          dom.modalCodeGs.classList.add('active');
          dom.codeGsContent.textContent = '載入中...';
          const res = await api.sheets.getCodeGs();
          if (res.success && res.code) {
            dom.codeGsContent.textContent = res.code;
          } else {
            dom.codeGsContent.textContent = '// 載入失敗: ' + (res.message || '未知錯誤');
          }
        } catch (err) {
          dom.codeGsContent.textContent = '// 載入失敗: ' + err.message;
        }
      });
    }

    // 一鍵複製 Code.gs
    const copyCodeHandler = async () => {
      const code = dom.codeGsContent.textContent;
      if (!code || code.startsWith('// 正在載入') || code.startsWith('// 載入失敗')) {
        showToast('尚無有效代碼可複製', 'error');
        return;
      }
      try {
        await navigator.clipboard.writeText(code);
        showToast('已複製 Code.gs 完整代碼至剪貼簿！可直接貼入 Google 試算表 Apps Script', 'success');
      } catch (err) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        showToast('已複製 Code.gs 代碼至剪貼簿！', 'success');
      }
    };

    if (dom.btnCopyCodeGs) dom.btnCopyCodeGs.addEventListener('click', copyCodeHandler);
    if (dom.btnCopyCodeGs2) dom.btnCopyCodeGs2.addEventListener('click', copyCodeHandler);

    // GCP 測試連線 (Service Account 模式)
    dom.btnTestConnection.addEventListener('click', async () => {
      try {
        dom.btnTestConnection.disabled = true;
        showToast('測試連線至 Google Sheets...', 'info');
        const res = await api.sheets.testConnection();
        if (res.success) {
          showToast(res.message, 'success');
        } else {
          showToast(res.message, 'error');
        }
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        dom.btnTestConnection.disabled = false;
      }
    });

    // 儲存 Google Sheets & Drive 設定 (Service Account 模式)
    dom.formSheetsConfig.addEventListener('submit', async e => {
      e.preventDefault();
      const email = dom.cfgEmail.value.trim();
      const sheetId = dom.cfgSheetId.value.trim();
      const driveFolderId = dom.cfgDriveFolder ? dom.cfgDriveFolder.value.trim() : '';
      const privateKey = dom.cfgKey.value.trim();
      const sheetName = dom.cfgSheetName.value.trim();

      if (!email || !sheetId || !privateKey) {
        showToast('請填寫完整 Email、試算表 ID 與私鑰', 'error');
        return;
      }

      try {
        const res = await api.sheets.updateConfig({
          email,
          spreadsheet_id: sheetId,
          drive_folder_id: driveFolderId,
          private_key: privateKey,
          sheet_name: sheetName
        });
        showToast(res.message, res.success ? 'success' : 'error');
        checkSheetsStatus();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });


    // 10. Modal 通用關閉按鈕
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.close;
        const targetModal = document.getElementById(modalId);
        if (targetModal) targetModal.classList.remove('active');
      });
    });

    // 點擊 Modal 外部半透明區域關閉
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // 監聽 401 Unauthorized 事件
    window.addEventListener('auth:unauthorized', () => {
      showToast('登入已過期，請重新登入', 'error');
      switchToLoginView();
    });
  }

  // 啟動入口
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
