// Overview matrix: operators x months, status icons, latest notes (FR-001, FR-002, FR-010, FR-012, FR-013).
// 版面照 Figma「月報及票證上傳」（管理者端 4287:155211、業者端 4276:149640）。
import { getStatus, STATUS } from '../status.js';
import { getOperators, getReport, latestComments } from '../store.js';
import { latestComment } from '../threads.js';
import { plainText } from '../richtext.js';
import { getToday } from '../clock.js';
import { esc, fmtDate, statusGlyph, micon } from './common.js';

export { statusGlyph };

const ASSET = 'assets/figma/';
/** 一次顯示 15 個月：選定年份 1–12 月＋隔年 1–3 月（同 Figma）。 */
const WINDOW = 15;
const pad = (n) => String(n).padStart(2, '0');

/** Where does clicking a cell lead? 'fill' | 'view' | null */
export function routeFor(session, status) {
  if (session.role === 'operator') {
    if (['open', 'overdue', 'needsUpdate'].includes(status)) return 'fill';
    if (['reviewing', 'completed', 'changeRequested'].includes(status)) return 'view';
    return null;
  }
  return ['reviewing', 'needsUpdate', 'completed', 'changeRequested'].includes(status) ? 'view' : null;
}

export const visibleOperators = (session) =>
  getOperators().filter((o) => session.role !== 'operator' || o.id === session.operatorId);

/** 業者端滑過格子時的白色提示（Figma 4287:166639 等）。 */
const OPERATOR_HINT = {
  overdue: '逾期未繳，請上傳檔案',
  needsUpdate: '資料異常，須重新上傳',
  open: '開放填報',
};

function monthsFrom(year) {
  return Array.from({ length: WINDOW }, (_, i) => {
    const y = year + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return { ym: `${y}-${pad(m)}`, m };
  });
}

const sortState = { key: null, dir: 1 };

function sortedOperators(session) {
  const rows = visibleOperators(session).map((op) => ({ op, notes: latestComments(op.id) }));
  const { key, dir } = sortState;
  if (!key) return rows;
  const val = (r) => (key === 'name' ? r.op.name : r.notes[key]?.at ?? '');
  return rows.sort((a, b) => dir * String(val(a)).localeCompare(String(val(b)), 'zh-Hant'));
}

function noteCell(note, { session, opId, kind }) {
  if (!note) return '<div class="hb-note" role="cell"><span class="hb-note-text is-empty">—</span></div>';
  // 業者與縣府都能在任務留言板回覆；唯讀單位只能檢視
  const canEdit = session.role !== 'readonly';
  const label = `${canEdit ? '回覆' : '檢視'}${kind === 'operator' ? '業者' : '縣府'}留言`;
  const text = plainText(note.text) || '（附件）';
  const tip = `${note.yearMonth}｜${fmtDate(note.at)}｜${note.author}${note.threadStatus === 'resolved' ? '（已解決）' : ''}\n${text}`;
  // 列內小圖示＝線上「班表」眼睛樣式（淺灰、滑過變深），圖形用導覽列同一套 Material 圖示
  return `<div class="hb-note" role="cell">
    <span class="hb-note-text" title="${esc(tip)}">${esc(text)}</span>
    <a class="hb-rowicon" href="report.html?mode=view&op=${esc(opId)}&ym=${note.yearMonth}#thread-${esc(note.threadId)}" aria-label="${label}" title="${label}">
      ${micon(canEdit ? 'edit' : 'visibility')}</a>
  </div>`;
}

const sortHead = (key, text) => {
  const on = sortState.key === key;
  const aria = on ? (sortState.dir === 1 ? 'ascending' : 'descending') : 'none';
  return `<button class="hb-th hb-th-sort" role="columnheader" aria-sort="${aria}" data-sort="${key}">
    <span>${text}</span><img src="${ASSET}ic-sort.svg" width="24" height="24" alt=""></button>`;
};

export function renderMatrix(root, { session, year, onYear }) {
  hideCellTip(); // 重畫後舊格子不見了，不會再觸發 mouseleave
  const today = getToday();
  const months = monthsFrom(year);
  const rows = sortedOperators(session);

  const head = `<div class="hb-grid hb-head" role="row">
    ${sortHead('name', '營運業者')}
    ${months.map((x) => `<div class="hb-th hb-th-month" role="columnheader">${x.m}月</div>`).join('')}
    ${sortHead('operator', '最新業者留言')}
    ${sortHead('county', '最新縣府留言')}
  </div>`;

  const body = rows.map(({ op, notes }) => {
    const cells = months.map(({ ym, m }) => {
      const report = getReport(op.id, ym);
      const st = getStatus(report, ym, today);
      const dest = routeFor(session, st);
      const lastFile = plainText(latestComment(report, 'operator')?.text ?? '');
      return `<button type="button" class="hb-cell st-${st}${dest ? '' : ' is-static'}" role="cell"
        data-op="${esc(op.id)}" data-ym="${ym}" data-m="${m}" data-st="${st}" data-dest="${dest ?? ''}" data-note="${esc(lastFile)}"
        aria-label="${esc(op.name)} ${ym} ${STATUS[st]}${dest ? '' : '（無可開啟的內容）'}" ${dest ? '' : 'aria-disabled="true"'}>${statusGlyph(st)}</button>`;
    }).join('');
    const sub = op.type === 'happybus' ? `<span class="hb-op-sub">幸福巴士 ${esc(op.happybusVersion)}</span>` : '';
    return `<div class="hb-grid hb-row" role="row">
      <div class="hb-op" role="rowheader" title="${esc(op.name)}"><span class="hb-op-name">${esc(op.name)}</span>${sub}</div>
      ${cells}
      ${noteCell(notes.operator, { session, opId: op.id, kind: 'operator' })}
      ${noteCell(notes.county, { session, opId: op.id, kind: 'county' })}
    </div>`;
  }).join('');

  root.innerHTML = `
    <div class="hb-section">
      <div class="hb-banner">
        <div class="hb-banner-text">
          <h2>營運月報</h2>
          <p>每月 10 日前需更新資料，若本月 1-10 日未更新，11 日即顯示遲繳</p>
        </div>
        <div class="hb-deadline"><span>提交期限</span><strong>每月10日</strong></div>
      </div>
      <div class="hb-tablewrap">
        <div class="hb-grid hb-yearrow">
          <span class="hb-year" style="grid-column:2 / span 4">${year}</span>
          <span class="hb-year" style="grid-column:14 / span 3">${year + 1}</span>
          <div class="hb-yearnav">
            <button type="button" class="hb-pill" id="yr-prev" aria-label="上一年"><img class="rot-l" src="${ASSET}ic-arrow-prev.svg" width="24" height="24" alt=""></button>
            <button type="button" class="hb-pill" id="yr-next" aria-label="下一年"><img class="rot-r" src="${ASSET}ic-arrow-next.svg" width="24" height="24" alt=""></button>
          </div>
        </div>
        <div class="hb-table" role="table" aria-label="營運月報狀態">${head}${body || '<div class="hb-empty">沒有可顯示的業者。</div>'}</div>
      </div>
    </div>`;

  root.querySelector('#yr-prev').onclick = () => onYear(year - 1);
  root.querySelector('#yr-next').onclick = () => onYear(year + 1);
  root.querySelectorAll('[data-sort]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.sort;
      sortState.dir = sortState.key === k ? -sortState.dir : 1;
      sortState.key = k;
      renderMatrix(root, { session, year, onYear });
    };
  });
  root.querySelectorAll('.hb-cell').forEach((b) => {
    b.onclick = () => {
      if (!b.dataset.dest) return;
      location.href = `report.html?mode=${b.dataset.dest}&op=${encodeURIComponent(b.dataset.op)}&ym=${b.dataset.ym}`;
    };
    const show = () => showCellTip(b, session);
    b.addEventListener('mouseenter', show);
    b.addEventListener('focus', show);
    b.addEventListener('mouseleave', hideCellTip);
    b.addEventListener('blur', hideCellTip);
  });
}

/* 滑過月份格：上方深色泡泡（月份／狀態／最新業者留言），業者端可操作的狀態另在下方出現白色提示 */
function showCellTip(cell, session) {
  const tip = document.getElementById('hb-tip');
  const hint = document.getElementById('hb-hint');
  if (!tip) return;
  const st = cell.dataset.st;
  const label = session.role === 'operator' && st === 'reviewing' ? '處理中' : STATUS[st];
  tip.innerHTML = `<div class="hb-bubble">${[`${cell.dataset.m}月`, label, cell.dataset.note].filter(Boolean).map(esc).join('<br>')}</div><span class="hb-ear"></span>`;
  tip.hidden = false;
  const r = cell.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  tip.style.left = `${r.left + r.width / 2 - t.width / 2 + scrollX}px`;
  tip.style.top = `${r.top - t.height - 2 + scrollY}px`;

  const text = session.role === 'operator' ? OPERATOR_HINT[st] : null;
  if (hint && text) {
    hint.textContent = text;
    hint.hidden = false;
    hint.style.left = `${r.left - 8 + scrollX}px`;
    hint.style.top = `${r.bottom + 4 + scrollY}px`;
  } else if (hint) hint.hidden = true;
}

function hideCellTip() {
  document.getElementById('hb-tip')?.setAttribute('hidden', '');
  document.getElementById('hb-hint')?.setAttribute('hidden', '');
}

export function renderLegend(el) {
  const order = ['open', 'completed', 'reviewing', 'needsUpdate', 'overdue', 'notStarted', 'changeRequested'];
  el.innerHTML = `<h3 class="hb-legend-title">狀態說明</h3>
    <ul class="hb-legend-list">${order.map((s) => `<li>${statusGlyph(s, { legend: true })}<span>${STATUS[s]}</span></li>`).join('')}</ul>`;
}
