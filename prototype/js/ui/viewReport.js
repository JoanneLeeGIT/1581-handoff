// 檢視／檢核頁（US2）：目前版本、切換版本（顯示儲存者）、與前一版差異標色、上方檢核狀態列、
// 右側任務留言板、變更申請、「有新版本」提示（FR-007..FR-009, FR-020）。縣府可從這裡進入編輯。
import { getStatus } from '../status.js';
import { can } from '../permissions.js';
import { getToday } from '../clock.js';
import { getVersion, diffVersions, compareBase, pendingChange } from '../versions.js';
import { getReport, reload, versionSaver } from '../store.js';
import { esc, statusBadge, fmtDate, msg, backLink, micon } from './common.js';
import { renderReportSheets, bindGuideToggle } from './fields.js';
import { enhanceSelect } from './select.js';
import { renderReviewBar } from './reviewPanel.js';
import { mountThreadBoard, threadPanelOpen, threadToggle } from './threadBoard.js';
import { renderChangeHistory } from './changeRequest.js';

let watcher = null;

const blocked = (root, text) => {
  root.innerHTML = `<section class="hb-card rpt-page">${backLink()}<div class="rpt-gap"></div>${msg(text, 'warn')}</section>`;
};

export function renderViewPage(root, { operator, yearMonth, session, selectedVersion }) {
  if (watcher) { clearInterval(watcher); watcher = null; }
  const own = { operatorId: operator.id, ownOperatorId: session.operatorId };
  if (!can(session.role, 'view', own)) return blocked(root, `目前的角色不能檢視「${esc(operator.name)}」的月報。`);
  const report = getReport(operator.id, yearMonth);
  const status = getStatus(report, yearMonth, getToday());
  if (!report?.versions?.length) return blocked(root, `${yearMonth} 尚未送出資料，沒有可檢視的內容。`);

  const vNo = selectedVersion ?? report.currentVersion;
  const ver = getVersion(report, vNo);
  const prevNo = compareBase(report, vNo);
  const prev = getVersion(report, prevNo);
  const changed = new Set(diffVersions(prev?.fields, ver.fields));
  // 畫面上的差異格數：延人公里的「數值」和「來源」在同一格，只算一次
  const diffCells = new Set([...changed].map((p) => p.replace(/passengerKmSource$/, 'passengerKm'))).size;
  const operatorForView = { ...operator, routes: operator.routes.map((r) => ({ ...r, serviceModes: ver.serviceModes?.[r.routeNo] ?? r.serviceModes })) };

  const fillHref = `report.html?mode=fill&op=${encodeURIComponent(operator.id)}&ym=${yearMonth}`;
  // 業者：檢核中可修改重送、待更新要更正；已完成可直接修改送出成為變更申請
  const OPERATOR_EDIT = { reviewing: '修改重送', needsUpdate: '更正並重新送出', completed: '申請變更', changeRequested: '修改變更內容' };
  const operatorCanFill = session.role === 'operator' && can('operator', 'submit', own) && OPERATOR_EDIT[status];
  const countyCanEdit = can(session.role, 'editData');
  const editBtn = countyCanEdit
    ? `<a class="hb-btn hb-btn-sm hb-btn-white" href="${fillHref}">${micon('edit', 18)}編輯資料</a>`
    : operatorCanFill ? `<a class="hb-btn hb-btn-sm" href="${fillHref}">${micon('edit', 18)}${OPERATOR_EDIT[status]}</a>` : '';
  const changeOf = (no) => (report.changeRequests ?? []).find((c) => c.versionNo === no);
  const CHANGE_TAG = { pending: '變更待處理', rejected: '變更已駁回', reopened: '變更已退回', approved: '變更已同意' };
  // 新的版本排上面；data-sub 給自訂下拉選單顯示第二行（時間＋儲存者）
  const versionOpts = [...report.versions].reverse().map((v) => {
    const c = changeOf(v.versionNo);
    const sub = `${fmtDate(v.submittedAt)}｜${versionSaver(v, operator)}${c ? `｜${CHANGE_TAG[c.outcome] ?? ''}` : ''}`;
    return `<option value="${v.versionNo}" data-sub="${esc(sub)}" ${v.versionNo === report.currentVersion ? 'data-badge="現行"' : ''} ${v.versionNo === vNo ? 'selected' : ''}>第 ${v.versionNo} 版</option>`;
  }).join('');

  root.innerHTML = `
    <section class="hb-card rpt-page">
      <div id="new-version"></div>
      <div class="hb-pagehead">
        ${backLink()}<span class="hb-pagehead-sep" aria-hidden="true"></span>
        <h1 class="hb-title">${esc(operator.name)} ${yearMonth} 營運月報</h1>
        ${statusBadge(status)}
        <div class="hb-pagehead-end">
          <label class="visually-hidden" for="ver-select">版本</label>
          <select id="ver-select" class="hb-select">${versionOpts}</select>
          <button type="button" class="hb-btn hb-btn-sm hb-btn-white guide-toggle" aria-expanded="false"><i class="bi bi-info-circle"></i>填寫說明</button>
          ${editBtn}
          ${threadToggle(threadPanelOpen())}
        </div>
      </div>
      <div id="review-bar"></div>
      <div class="rpt-body${threadPanelOpen() ? ' is-threads-open' : ''}">
        <div class="rpt-body-main">
          ${renderReportSheets(operatorForView, ver.fields, { mode: 'view', changed, yearMonth, diffCount: prev ? diffCells : undefined, diffBase: prev ? prevNo : undefined })}
          ${renderChangeHistory(report)}
        </div>
        <aside class="hb-threads" id="threads" aria-label="任務留言板"></aside>
      </div>
    </section>`;

  const rerender = (v) => renderViewPage(root, { operator, yearMonth, session, selectedVersion: v });
  bindGuideToggle(root);
  const verSel = root.querySelector('#ver-select');
  verSel.onchange = (e) => rerender(Number(e.target.value));
  enhanceSelect(verSel, { label: '版本' });

  // 任務留言板：數量變動時同步更新頁首按鈕與上方狀態列
  const reviewCtx = { operator, yearMonth, session, status, onDone: () => rerender() };
  const board = mountThreadBoard({
    host: root.querySelector('#threads'), sheets: root.querySelector('.report-sheets'), operator, yearMonth, session,
    onCount: (n) => {
      root.querySelectorAll('[data-threads-count]').forEach((c) => { c.textContent = n; c.hidden = !n; });
      renderReviewBar(root.querySelector('#review-bar'), { ...reviewCtx, report: getReport(operator.id, yearMonth) });
    },
  });
  root.querySelector('[data-threads-toggle]').onclick = () => board.setOpen(!board.isOpen());

  // 別的分頁或使用者送出新版本時提示
  const shown = report.currentVersion;
  watcher = setInterval(() => {
    reload();
    const now = getReport(operator.id, yearMonth);
    if (now && now.currentVersion !== shown && now.versions.length > report.versions.length) {
      const saver = versionSaver(getVersion(now, now.currentVersion), operator);
      root.querySelector('#new-version').innerHTML = `<div class="rpt-notice">${msg(`${esc(saver)} 已儲存新版本（第 ${now.currentVersion} 版），目前畫面不是最新資料。`, 'warn',
        '<button type="button" class="hb-btn hb-btn-sm hb-btn-white hb-msg-action" id="nv-reload">載入最新版本</button>')}</div>`;
      root.querySelector('#nv-reload').onclick = () => rerender();
      clearInterval(watcher); watcher = null;
    }
  }, 2000);
}
