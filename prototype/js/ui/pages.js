// Page entry points for index.html and report.html.
import { initStore, getSession, getOperator, getReport } from '../store.js';
import { getToday } from '../clock.js';
import { can } from '../permissions.js';
import { mountToolbar } from './toolbar.js';
import { mountSidebar } from './sidebar.js';
import { renderMatrix, renderLegend } from './matrix.js';
import { renderFillPage } from './fillForm.js';
import { renderViewPage } from './viewReport.js';
import { openExportDialog, showUploadHelp } from './download.js';
import { renderTicketMatrix, renderTicketLegend, renderTicketPage, showTicketHelp } from './ticketTab.js';
import { renderOverview as renderTaskOverview, renderRole as renderTaskRole } from './monthlyTasks.js';
import { ROLES, MANUAL, defaultRoleTab, visibleTabs } from '../monthlyTasks.js';
import { qs, esc, toast, msg, backLink, showModal } from './common.js';

async function boot() {
  try {
    await initStore();
    return true;
  } catch (e) {
    document.getElementById('main').innerHTML = `<section class="hb-card">${msg(`載入示範資料失敗：${esc(e.message)}。請用「開啟原型.bat」開啟，不要直接雙擊 HTML 檔。`, 'danger')}</section>`;
    return false;
  }
}

export async function initIndexPage() {
  if (!(await boot())) return;
  let year = Number(getToday().slice(0, 4));

  const A = 'assets/figma/';
  // 目前分頁：網址 #ticket 直接開票證資料（從票證內頁返回時用）
  let tab = location.hash === '#ticket' ? 'ticket' : 'monthly';

  const render = () => {
    const session = getSession();
    mountSidebar(document.getElementById('sidebar'));
    const onYear = (y) => { year = y; render(); };
    if (tab === 'monthly') {
      renderMatrix(document.getElementById('matrix'), { session, year, onYear });
      renderLegend(document.getElementById('legend'));
    } else {
      renderTicketMatrix(document.getElementById('ticket'), { session, year, onYear });
      renderTicketLegend(document.getElementById('legend'));
    }
    document.querySelectorAll('.hb-tab').forEach((t) => {
      const on = t.dataset.tab === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    document.getElementById('tab-monthly').hidden = tab !== 'monthly';
    document.getElementById('tab-ticket').hidden = tab !== 'ticket';

    // 業者也要上傳票證資料，所以所有角色都有分頁；按鈕放在分頁列右側
    const actions = document.getElementById('actions-tab');
    const help = `<button type="button" class="hb-btn" id="act-help"><span class="hb-ic-msg"><img src="${A}ic-message.svg" width="16.9551" height="17" alt=""></span>${tab === 'ticket' ? '上傳說明' : '填報說明'}</button>`;
    const exportBtn = tab === 'monthly' && can(session.role, 'export')
      ? `<button type="button" class="hb-btn" id="act-export"><img src="${A}ic-download.svg" width="24" height="24" alt="">匯出</button>` : '';
    actions.innerHTML = help + exportBtn;
    actions.querySelector('#act-help').onclick = tab === 'ticket' ? () => showTicketHelp(showModal) : showUploadHelp;
    actions.querySelector('#act-export')?.addEventListener('click', openExportDialog);
  };

  document.querySelectorAll('.hb-tab').forEach((t) => {
    t.onclick = () => {
      tab = t.dataset.tab;
      history.replaceState(null, '', tab === 'ticket' ? '#ticket' : location.pathname + location.search);
      render();
    };
  });

  mountToolbar(document.getElementById('toolbar'), render);
  render();

  const flash = sessionStorage.getItem('huabus-flash');
  if (flash) { sessionStorage.removeItem('huabus-flash'); toast(flash); }
}

/** 系統資訊 → 每月任務。分頁記在網址 #分頁代碼；沒指定時依登入角色帶預設分頁。 */
export async function initTasksPage() {
  if (!(await boot())) return;
  const me = () => { const s = getSession(); return [s, s.role === 'operator' ? getOperator(s.operatorId) : null]; };
  const allowed = () => visibleTabs(...me()); // 業者只看自己單位的分頁
  const fromHash = () => (allowed().includes(location.hash.slice(1)) ? location.hash.slice(1) : null);
  const roleTab = () => defaultRoleTab(...me());
  let tab = fromHash() ?? roleTab();
  let month = null; // null＝跟著模擬今天

  const render = () => {
    const today = getToday();
    const year = Number(today.slice(0, 4));
    const currentMonth = Number(today.slice(5, 7));
    const m = month ?? currentMonth;
    mountSidebar(document.getElementById('sidebar'), { active: 'tasks' });

    const tabs = document.getElementById('mt-tabs');
    const ids = allowed();
    if (!ids.includes(tab)) tab = roleTab();
    tabs.innerHTML = [{ id: 'ov', name: '總覽' }, ...ROLES].filter((r) => ids.includes(r.id)).map((r) =>
      `<button type="button" class="hb-tab${r.id === tab ? ' active' : ''}" role="tab" aria-selected="${r.id === tab}" data-tab="${r.id}">${esc(r.name)}</button>`).join('');
    tabs.querySelectorAll('.hb-tab').forEach((t) => {
      t.onclick = () => { tab = t.dataset.tab; history.replaceState(null, '', `#${tab}`); render(); };
    });

    const actions = document.getElementById('mt-actions');
    actions.innerHTML = tab === 'ov'
      ? `<a class="hb-btn" id="mt-manual" href="${esc(MANUAL.href)}" download="${esc(MANUAL.name)}"><img src="assets/figma/ic-download.svg" width="24" height="24" alt="">下載操作手冊</a>`
      : '<button type="button" class="hb-btn hb-btn-white" id="mt-print"><i class="bi bi-printer hb-btn-bi" aria-hidden="true"></i>列印</button>';
    actions.querySelector('#mt-print')?.addEventListener('click', () => window.print());
    // 原型：手冊檔案還沒放進 prototype/docs/ 時給提示，不要下載到錯誤頁
    actions.querySelector('#mt-manual')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const a = e.currentTarget;
      const ok = await fetch(a.href, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
      if (!ok) { toast('操作手冊檔案尚未提供', 'danger'); return; }
      const dl = Object.assign(document.createElement('a'), { href: a.href, download: MANUAL.name });
      dl.click();
    });

    const body = document.getElementById('mt-body');
    if (tab === 'ov') renderTaskOverview(body);
    else renderTaskRole(body, { roleId: tab, year, month: m, currentMonth, onMonth: (v) => { month = v; render(); } });
  };

  // 切換角色或模擬日期：分頁回到該角色的預設、月份回到模擬今天
  mountToolbar(document.getElementById('toolbar'), () => { tab = roleTab(); month = null; history.replaceState(null, '', location.pathname); render(); });
  render();
}

export async function initReportPage() {
  if (!(await boot())) return;
  const mode = qs('mode');
  const operatorId = qs('op');
  const yearMonth = qs('ym');
  const quarter = qs('q');
  const root = document.getElementById('main');

  const render = () => {
    const operator = getOperator(operatorId);
    const okKey = mode === 'ticket' ? /^\d{4}-Q[1-4]$/.test(quarter ?? '') : /^\d{4}-\d{2}$/.test(yearMonth ?? '');
    if (!operator || !okKey) {
      root.innerHTML = `<section class="hb-card rpt-page">${backLink()}<div class="rpt-gap"></div>${msg('找不到這個業者或月份。', 'danger')}</section>`;
      return;
    }
    const session = getSession();
    if (mode === 'ticket') { renderTicketPage(root, { operator, quarter, session }); return; }
    const ctx ={ operator, yearMonth, session, report: getReport(operatorId, yearMonth) };
    if (mode === 'fill') renderFillPage(root, ctx);
    else renderViewPage(root, ctx);
  };

  mountToolbar(document.getElementById('toolbar'), () => location.reload());
  mountSidebar(document.getElementById('sidebar'));
  render();

  const flash = sessionStorage.getItem('huabus-flash');
  if (flash) { sessionStorage.removeItem('huabus-flash'); toast(flash); }
}
