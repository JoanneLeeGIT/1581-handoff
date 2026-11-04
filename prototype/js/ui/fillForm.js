// 填報頁（US1, US4）：業者線上填報（不提供檔案匯入，FR-004）；縣府也可從檢視頁進來直接修改業者資料（存成新版本）。
import { getStatus, STATUS, DEADLINE_DAY } from '../status.js';
import { can } from '../permissions.js';
import { getToday } from '../clock.js';
import { getCurrentVersion, pendingChange } from '../versions.js';
import { submitReport, saveAsCounty, requestChange } from '../store.js';
import { esc, statusBadge, toast, msg, backLink } from './common.js';
import { mountThreadBoard, threadPanelOpen, threadToggle } from './threadBoard.js';
import { renderReportSheets, bindGuideToggle, bindSheetInteractions, recompute, collectFields, importShiftDetail, fillProgress } from './fields.js';
const FILLABLE = ['open', 'overdue', 'needsUpdate', 'reviewing'];
/** 已完成／申請變更中的月份：業者直接修改，送出即成為變更申請（新版本）。 */
const CHANGEABLE = ['completed', 'changeRequested'];

const blocked = (root, text, back) => {
  root.innerHTML = `<section class="hb-card rpt-page">${back}<div class="rpt-gap"></div>${msg(text, 'warn')}</section>`;
};

export function renderFillPage(root, { operator, yearMonth, session, report }) {
  const status = getStatus(report, yearMonth, getToday());
  const isCounty = session.role === 'county';
  const viewHref = `report.html?mode=view&op=${encodeURIComponent(operator.id)}&ym=${yearMonth}`;
  const cancelHref = isCounty || report?.versions?.length ? viewHref : 'index.html';
  const back = isCounty ? backLink(viewHref, '返回', '返回月報檢視') : backLink();

  if (isCounty) {
    if (!can('county', 'editData')) return blocked(root, '目前的角色不能修改月報資料。', back);
    if (!report?.versions?.length) return blocked(root, `${yearMonth} 業者尚未送出資料，沒有可修改的內容。`, backLink());
  } else {
    const own = { operatorId: operator.id, ownOperatorId: session.operatorId };
    if (!can(session.role, 'submit', own)) return blocked(root, `目前的角色不能填報「${esc(operator.name)}」的月報。請在下方原型工具列切換成該業者。`, back);
    if (![...FILLABLE, ...CHANGEABLE].includes(status)) return blocked(root, `${yearMonth} 目前狀態為「${STATUS[status]}」，不能填報。`, back);
  }

  const isChange = !isCounty && CHANGEABLE.includes(status);
  const pending = pendingChange(report);
  const baseNo = pending?.baseVersion ?? report?.currentVersion;
  const initial = getCurrentVersion(report)?.fields ?? {};
  const shiftBtn = operator.shiftDetailAvailable
    ? '<button type="button" class="hb-btn hb-btn-sm hb-btn-white" id="shift-import"><i class="bi bi-box-arrow-in-down"></i>從班次明細帶入</button>' : '';
  // 已有送出紀錄時顯示任務留言板，業者可對照縣府的留言更正、回覆
  const hasBoard = Boolean(report?.versions?.length);
  const notice = isCounty
    ? msg('你正在以縣府身分修改業者資料。儲存後會成為新版本，並記錄儲存者；月報狀態不變。', 'info')
    : isChange ? msg(pending
      ? `你正在修改尚待縣府處理的變更（第 ${pending.versionNo} 版）。送出後會再存成新版本；縣府同意前，仍以第 ${baseNo} 版為準。`
      : `此月份已檢核完成。直接修改後送出，會存成新版本並進入「申請變更」；縣府同意前，仍以第 ${baseNo} 版為準。`, 'warn')
    : status === 'overdue' ? msg(`已超過每月 ${DEADLINE_DAY} 日的期限，仍可補填送出。`, 'danger') : '';

  // 表格上方的填報狀態列：進度、待修正格數、帶入／送出的訊息（捲動時固定在畫面上方）
  const statusBar = `
    <div class="rpt-status" id="fill-status">
      <div class="rpt-progress" aria-live="polite">
        <span class="rpt-progress-label">填報進度</span>
        <span class="rpt-progress-track"><span class="rpt-progress-fill"></span></span>
        <span class="rpt-progress-num"></span>
      </div>
      <button type="button" class="rpt-errchip" hidden></button>
      <div class="rpt-status-msg" id="fill-msg"></div>
    </div>
    <div id="form-error" role="alert" aria-live="assertive"></div>`;

  root.innerHTML = `
    <section class="hb-card rpt-page">
      <div class="hb-pagehead">
        ${back}<span class="hb-pagehead-sep" aria-hidden="true"></span>
        <h1 class="hb-title">${esc(operator.name)} ${yearMonth} 營運月報</h1>
        ${statusBadge(status)}
        ${isCounty ? '<span class="hb-tag">縣府編輯</span>' : isChange ? '<span class="hb-tag">申請變更</span>' : `<span class="hb-tag"><i class="bi bi-calendar3"></i>每月 ${DEADLINE_DAY} 日截止</span>`}
        <div class="hb-pagehead-end">
          ${shiftBtn}
          <button type="button" class="hb-btn hb-btn-sm hb-btn-white guide-toggle" aria-expanded="false"><i class="bi bi-info-circle"></i>填寫說明</button>
          ${hasBoard ? threadToggle(threadPanelOpen()) : ''}
        </div>
      </div>
      ${notice ? `<div class="rpt-notice">${notice}</div>` : ''}
      <div class="rpt-body${hasBoard && threadPanelOpen() ? ' is-threads-open' : ''}">
      <form id="fill-form" class="rpt-body-main" novalidate>
        ${renderReportSheets(operator, initial, { mode: 'edit', yearMonth, topBar: statusBar })}
        ${isCounty ? '' : isChange
    ? `<div class="rpt-field"><label class="hb-label" for="change-reason">變更原因（必填）</label><textarea class="hb-textarea" id="change-reason" rows="2" placeholder="例如包車出租人數填錯，需更正。縣府會依此決定駁回、退回或同意。">${esc(pending?.reason ?? '')}</textarea></div>`
    : '<div class="rpt-field"><label class="hb-label" for="file-note">給縣府的留言（選填）</label><textarea class="hb-textarea" id="file-note" rows="2" placeholder="例如本月停駛、資料補正的說明。送出後會出現在任務留言板。"></textarea></div>'}
        <div class="rpt-actions">
          <a class="hb-btn hb-btn-white" href="${cancelHref}">取消</a>
          <button class="hb-btn" type="submit"><i class="bi ${isCounty ? 'bi-floppy' : 'bi-send'}"></i>${isCounty ? '儲存修改' : isChange ? '送出變更申請' : '送出月報'}</button>
        </div>
      </form>
      ${hasBoard ? '<aside class="hb-threads" id="threads" aria-label="任務留言板"></aside>' : ''}
      </div>
    </section>`;

  const form = root.querySelector('#fill-form');
  let dirty = false;
  const onBeforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onBeforeUnload);

  bindGuideToggle(root);
  if (hasBoard) {
    const board = mountThreadBoard({
      host: root.querySelector('#threads'), sheets: root.querySelector('.report-sheets'), operator, yearMonth, session,
      onCount: (n) => root.querySelectorAll('[data-threads-count]').forEach((c) => { c.textContent = n; c.hidden = !n; }),
    });
    root.querySelector('[data-threads-toggle]').onclick = () => board.setOpen(!board.isOpen());
  }
  bindSheetInteractions(form, operator, () => { dirty = true; });
  const errBox = root.querySelector('#form-error');
  const msgBox = root.querySelector('#fill-msg');
  const errChip = root.querySelector('.rpt-errchip');

  const updateStatus = () => {
    const p = fillProgress(form);
    const pct = p.total ? Math.round((p.filled / p.total) * 100) : 100;
    root.querySelector('.rpt-progress-fill').style.width = `${pct}%`;
    root.querySelector('.rpt-progress-num').innerHTML = `<b>${p.filled}</b>／${p.total} 格`;
    root.querySelector('.rpt-progress').classList.toggle('is-done', p.filled === p.total && !p.errors);
    errChip.hidden = !p.errors;
    errChip.innerHTML = `<i class="bi bi-exclamation-circle"></i>${p.errors} 格需修正`;
  };
  errChip.addEventListener('click', () => {
    const first = form.querySelector('td.is-error input');
    first?.scrollIntoView({ block: 'center', inline: 'center' });
    first?.focus({ preventScroll: true });
  });

  form.addEventListener('focusout', () => { setTimeout(() => { updateStatus(); if (!form.querySelector('.is-invalid')) errBox.innerHTML = ''; }); });
  form.addEventListener('input', (e) => { dirty = true; e.target.closest('td')?.classList.remove('is-filled'); recompute(form, operator); updateStatus(); });

  // 從班次明細帶入：可一鍵復原成帶入前的數字
  root.querySelector('#shift-import')?.addEventListener('click', () => {
    const res = importShiftDetail(form, operator);
    updateStatus();
    if (!res.changed) { msgBox.innerHTML = '<span class="rpt-status-note">班次明細的數字和目前相同，沒有變更。</span>'; return; }
    dirty = true;
    msgBox.innerHTML = `<span class="rpt-status-note is-filled"><i class="hb-sw is-filled"></i>已帶入 ${res.changed} 格${res.overwritten ? `，其中 ${res.overwritten} 格取代了原本的數字` : ''}</span>
      <button type="button" class="rpt-undo"><i class="bi bi-arrow-counterclockwise"></i>復原</button>`;
    msgBox.querySelector('.rpt-undo').addEventListener('click', () => {
      const n = res.undo();
      updateStatus();
      msgBox.innerHTML = `<span class="rpt-status-note">已復原 ${n} 格，回到帶入前的數字。</span>`;
    }, { once: true });
  });
  recompute(form, operator);
  updateStatus();
  dirty = false;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const res = collectFields(form, operator);
    if (!res.ok) {
      // 全部列出；太多時清單可捲動，點一項就跳到那一格
      const list = res.messages.map((m, i) => `<li><button type="button" class="rpt-errlist-item" data-i="${i}">${esc(m)}</button></li>`).join('');
      errBox.innerHTML = msg(`有 ${res.errors} 格未填或格式不對，已標紅。點下方項目可跳到該格：<ul class="rpt-errlist hb-scroll">${list}</ul>`, 'danger');
      errBox.querySelectorAll('.rpt-errlist-item').forEach((b) => b.addEventListener('click', () => {
        const el = res.els[Number(b.dataset.i)];
        el?.scrollIntoView({ block: 'center', inline: 'center' });
        el?.focus({ preventScroll: true });
      }));
      updateStatus();
      res.first?.scrollIntoView({ block: 'center', inline: 'center' });
      res.first?.focus({ preventScroll: true });
      return;
    }
    errBox.innerHTML = '';
    const reasonEl = form.querySelector('#change-reason');
    if (isChange && !reasonEl.value.trim()) {
      errBox.innerHTML = msg('請填寫變更原因。', 'danger');
      reasonEl.focus();
      return;
    }
    const out = isCounty
      ? saveAsCounty(operator.id, yearMonth, res.fields, session)
      : isChange ? requestChange(operator.id, yearMonth, res.fields, reasonEl.value, session)
      : submitReport(operator.id, yearMonth, res.fields, form.querySelector('#file-note').value, session);
    if (!out.ok) { errBox.innerHTML = msg(`${isCounty ? '儲存' : '送出'}失敗：${esc(out.error)}`, 'danger'); return; }
    dirty = false;
    window.removeEventListener('beforeunload', onBeforeUnload);
    if (isCounty) {
      sessionStorage.setItem('huabus-flash', `已儲存第 ${out.report.currentVersion} 版`);
      location.href = viewHref;
    } else if (isChange) {
      sessionStorage.setItem('huabus-flash', `已送出變更（第 ${out.report.currentVersion} 版），等待縣府處理`);
      location.href = viewHref;
    } else {
      sessionStorage.setItem('huabus-flash', `${operator.name} ${yearMonth} 月報已送出，狀態：檢核中`);
      location.href = 'index.html';
    }
  });
}
