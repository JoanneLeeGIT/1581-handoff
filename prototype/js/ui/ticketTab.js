// 票證資料：總覽（業者 × 季）與單季內頁（上傳檔案、上傳紀錄、資料筆數）。
// 票證資料不是線上填報，業者每季上傳一次檔案；可重新上傳，最新一筆為準。
import {
  TICKET_STATUS, TICKET_DEADLINE_DAY, quartersOf, parseQuarter, quarterLabel, quarterMonths, dueMonth, dueWindow,
  uploadsFor, getTicketStatus, isLate, canUploadNow, countDataRows,
  TICKET_FILE_ACCEPT, isTicketFile, uploadFiles, mergeFiles,
} from '../ticket.js';
import { getTicketUploads, addTicketUpload } from '../store.js';
import { can } from '../permissions.js';
import { getToday } from '../clock.js';
import { esc, fmtDate, statusGlyph, msg, backLink, toast } from './common.js';
import { visibleOperators } from './matrix.js';

const ASSET = 'assets/figma/';
const num = (n) => Number(n ?? 0).toLocaleString('en-US');
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const dueText = (key) => { const d = dueMonth(key); return `${d.year}/${d.month}/${TICKET_DEADLINE_DAY}`; };
const ticketHref = (opId, key) => `report.html?mode=ticket&op=${encodeURIComponent(opId)}&q=${key}`;

const ticketBadge = (st) => `<span class="hb-status st-${st}">${statusGlyph(st, { legend: true })}${TICKET_STATUS[st]}</span>`;

export function renderTicketMatrix(root, { session, year, onYear }) {
  const today = getToday();
  const quarters = quartersOf(year);
  const all = getTicketUploads();

  const head = `<div class="hb-grid hb-grid-q hb-head" role="row">
    <div class="hb-th hb-th-op" role="columnheader">營運業者</div>
    ${quarters.map((k) => `<div class="hb-th hb-th-q" role="columnheader">第 ${parseQuarter(k).q} 季<span>${quarterMonths(k)}｜${dueText(k)} 截止</span></div>`).join('')}
    <div class="hb-th hb-th-op" role="columnheader">最新上傳</div>
  </div>`;

  const body = visibleOperators(session).map((op) => {
    let latest = null;
    const cells = quarters.map((k) => {
      const list = uploadsFor(all, op.id, k);
      const st = getTicketStatus(list, k, today);
      const last = list[0];
      if (last && (!latest || last.uploadedAt > latest.uploadedAt)) latest = { ...last };
      const open = list.length || canUploadNow(k, today);
      const late = last && isLate(list.at(-1), k);
      const label = `${op.name} ${quarterLabel(k)} ${TICKET_STATUS[st]}${last ? `，${num(last.rows)} 筆` : ''}`;
      return `<button type="button" class="hb-qcell st-${st}${open ? '' : ' is-static'}" role="cell" data-href="${open ? ticketHref(op.id, k) : ''}"
        aria-label="${esc(label)}" title="${esc(label)}" ${open ? '' : 'aria-disabled="true"'}>
        ${statusGlyph(st)}
        <span class="hb-qcell-text">${last ? `<b>${num(last.rows)}</b> 筆${late ? '<em>逾期上傳</em>' : ''}` : TICKET_STATUS[st]}</span>
      </button>`;
    }).join('');
    // 最新上傳：也要看選定年份以外的季，取所有紀錄最新一筆
    const newest = all.filter((u) => u.operatorId === op.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
    const sub = op.type === 'happybus' ? `<span class="hb-op-sub">幸福巴士 ${esc(op.happybusVersion)}</span>` : '';
    return `<div class="hb-grid hb-grid-q hb-row" role="row">
      <div class="hb-op" role="rowheader" title="${esc(op.name)}"><span class="hb-op-name">${esc(op.name)}</span>${sub}</div>
      ${cells}
      <div class="hb-note" role="cell">${newest
        ? `<span class="hb-note-text" title="${esc(`${newest.fileName}（${quarterLabel(newest.quarter)}）`)}">${fmtDate(newest.uploadedAt).slice(0, 10)}｜${esc(newest.quarter.replace('-', ' '))}｜${num(newest.rows)} 筆</span>`
        : '<span class="hb-note-text is-empty">—</span>'}</div>
    </div>`;
  }).join('');

  root.innerHTML = `
    <div class="hb-section">
      <div class="hb-banner">
        <div class="hb-banner-text">
          <h2>票證資料</h2>
          <p>每季結束後的下一個月 15 日前上傳；若 1、4、7、10 月 1–15 日間未上傳，當月 16 日起將顯示逾期。資料於次月底上架</p>
        </div>
        <div class="hb-deadline"><span>提交期限</span><strong>1、4、7、10月15日</strong></div>
      </div>
      <div class="hb-tablewrap">
        <div class="hb-grid hb-grid-q hb-yearrow">
          <span class="hb-year" style="grid-column:2 / span 4">${year}</span>
          <div class="hb-yearnav">
            <button type="button" class="hb-pill" data-yr="-1" aria-label="上一年"><img class="rot-l" src="${ASSET}ic-arrow-prev.svg" width="24" height="24" alt=""></button>
            <button type="button" class="hb-pill" data-yr="1" aria-label="下一年"><img class="rot-r" src="${ASSET}ic-arrow-next.svg" width="24" height="24" alt=""></button>
          </div>
        </div>
        <div class="hb-table" role="table" aria-label="票證資料上傳狀態">${head}${body || '<div class="hb-empty">沒有可顯示的業者。</div>'}</div>
      </div>
    </div>`;

  root.querySelectorAll('[data-yr]').forEach((b) => { b.onclick = () => onYear(year + Number(b.dataset.yr)); });
  root.querySelectorAll('.hb-qcell').forEach((b) => {
    b.onclick = () => { if (b.dataset.href) location.href = b.dataset.href; };
  });
}

export function renderTicketLegend(el) {
  el.innerHTML = `<h3 class="hb-legend-title">狀態說明</h3>
    <ul class="hb-legend-list">${['open', 'completed', 'overdue', 'notStarted'].map((s) => `<li>${statusGlyph(s, { legend: true })}<span>${TICKET_STATUS[s]}</span></li>`).join('')}</ul>`;
}

export function showTicketHelp(showModal) {
  showModal({
    title: '票證資料上傳說明',
    body: `<ul>
      <li>票證資料<strong>不需線上填報</strong>，每季上傳一次檔案（CSV 或 Excel，可一次上傳多個檔案）。只需上傳票證資料，準點率由系統廠商另行計算。</li>
      <li>每季結束後的<strong>下一個月 1–15 日</strong>上傳：第 1 季 → 4 月、第 2 季 → 7 月、第 3 季 → 10 月、第 4 季 → 隔年 1 月。資料於次月底上架。</li>
      <li>15 日前未上傳，<strong>16 日起顯示「逾期未繳」</strong>，仍可補傳。</li>
            <li>只接受 CSV、Excel（.xlsx、.xls），圖片、PDF 等其他格式不收。系統會讀取每個檔案計算資料筆數（第一列視為表頭）；同一次選的多個檔案算一次上傳。上傳後可再上傳更新，以最新一次為準，舊紀錄保留。</li></ul>`,
  });
}

// ---------- 單季內頁 ----------

/** 讀檔計算資料筆數：CSV／Excel 用 SheetJS 讀第一個工作表。 */
async function readRows(file) {
  if (!window.XLSX) throw new Error('Excel 函式庫未載入（需要連線到網際網路）');
  const buf = await file.arrayBuffer();
  const wb = window.XLSX.read(buf, { type: 'array', codepage: 65001 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return countDataRows(window.XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }));
}

export function renderTicketPage(root, { operator, quarter, session }) {
  const back = backLink('index.html#ticket', '返回', '返回票證資料總覽');
  const own = { operatorId: operator.id, ownOperatorId: session.operatorId };
  if (!can(session.role, 'view', own)) {
    root.innerHTML = `<section class="hb-card rpt-page">${back}<div class="rpt-gap"></div>${msg(`目前的角色不能檢視「${esc(operator.name)}」的票證資料。`, 'warn')}</section>`;
    return;
  }
  const today = getToday();
  const list = uploadsFor(getTicketUploads(), operator.id, quarter);
  const st = getTicketStatus(list, quarter, today);
  const w = dueWindow(quarter);
  const canUpload = can(session.role, 'uploadTicket', own) && canUploadNow(quarter, today);
  const latest = list[0];

  const notice = {
    notStarted: `上傳期間為 ${w.from.replaceAll('-', '/')}–${w.to.slice(8)} 日。季已結束，可以先上傳。`,
    open: `上傳期間至 ${w.to.replaceAll('-', '/')}，16 日起顯示逾期。`,
    overdue: `已超過 ${w.to.replaceAll('-', '/')} 的期限，仍可補傳。`,
    completed: `已上傳 ${list.length} 次，以最新一次為準。${list.length && isLate(list.at(-1), quarter) ? '首次上傳晚於期限（逾期上傳）。' : ''}`,
  }[st];

  const summary = `<div class="tk-summary">
      <div><span>資料筆數（最新）</span><strong>${latest ? `${num(latest.rows)} 筆` : '—'}</strong></div>
      <div><span>最新上傳</span><strong>${latest ? fmtDate(latest.uploadedAt) : '—'}</strong></div>
      <div><span>上傳次數</span><strong>${list.length}</strong></div>
      <div><span>上傳期限</span><strong>${w.to.replaceAll('-', '/')}</strong></div>
    </div>`;

  const uploader = canUpload ? `<div class="hb-box tk-upload">
      <h3 class="hb-subtitle">${list.length ? '重新上傳（更新資料）' : '上傳檔案'}</h3>
      <div class="tk-drop" id="tk-drop" tabindex="0" role="button" aria-label="選擇票證資料檔案，可複選">
        <i class="bi bi-cloud-arrow-up"></i>
        <span>拖曳檔案到這裡，或<u>選擇檔案</u></span>
        <span class="tk-drop-hint">可複選；只接受 CSV、Excel（.csv、.xlsx、.xls），不接受圖片、PDF 等其他格式</span>
        <input type="file" id="tk-file" accept="${TICKET_FILE_ACCEPT}" multiple hidden>
      </div>
      <ul class="tk-picked" id="tk-picked" aria-live="polite"></ul>
      <div><label class="hb-label" for="tk-note">備註（選填）</label><input class="hb-input" id="tk-note" placeholder="例如補上漏傳的日期"></div>
      <div id="tk-err"></div>
      <div class="rpt-actions"><button type="button" class="hb-btn" id="tk-go" disabled><i class="bi bi-upload"></i>上傳</button></div>
    </div>` : '';

  const rows = list.map((u, i) => `<tr>
      <td>${fmtDate(u.uploadedAt)}${i === 0 ? ' <span class="hb-tag tk-tag">最新</span>' : ''}${isLate(u, quarter) ? ' <span class="hb-tag hb-tag-warn tk-tag">逾期</span>' : ''}</td>
      <td class="tk-file">${uploadFiles(u).map((f) => `<div><i class="bi bi-file-earmark-spreadsheet"></i>${esc(f.fileName)}${uploadFiles(u).length > 1 ? `<span class="tk-file-sub">${fmtSize(f.size)}｜${num(f.rows)} 筆</span>` : ''}</div>`).join('')}</td>
      <td class="tk-num">${fmtSize(u.size)}</td>
      <td class="tk-num">${num(u.rows)}</td>
      <td>${esc(u.uploadedBy)}</td>
      <td>${esc(u.note) || '<span class="is-empty">—</span>'}</td>
    </tr>`).join('');

  root.innerHTML = `
    <section class="hb-card rpt-page">
      <div class="hb-pagehead">
        ${back}<span class="hb-pagehead-sep" aria-hidden="true"></span>
        <h1 class="hb-title">${esc(operator.name)} ${quarterLabel(quarter)} 票證資料</h1>
        ${ticketBadge(st)}
        <span class="hb-tag"><i class="bi bi-calendar3"></i>${dueText(quarter)} 截止</span>
      </div>
      <div class="rpt-notice">${msg(notice, st === 'overdue' ? 'danger' : st === 'completed' ? 'success' : 'info')}</div>
      ${summary}
      ${uploader}
      <div class="rpt-block">
        <h3 class="hb-subtitle">檔案上傳紀錄</h3>
        ${list.length ? `<div class="tk-tablewrap"><table class="tk-table">
          <thead><tr><th>上傳時間</th><th>檔案名稱</th><th class="tk-num">檔案大小（合計）</th><th class="tk-num">資料筆數（合計）</th><th>上傳者</th><th>備註</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
          <p class="tk-foot">原型只記錄檔名、大小與筆數，不保存檔案內容。</p>`
        : '<div class="hb-empty">尚未上傳任何檔案。</div>'}
      </div>
    </section>`;

  if (!canUpload) return;
  const input = root.querySelector('#tk-file');
  const drop = root.querySelector('#tk-drop');
  const go = root.querySelector('#tk-go');
  const err = root.querySelector('#tk-err');
  const pickedEl = root.querySelector('#tk-picked');
  let picked = []; // { fileName, size, rows | null, error }
  const ok = () => picked.filter((f) => f.rows);

  const draw = () => {
    pickedEl.innerHTML = picked.map((f, i) => `<li class="${f.error ? 'is-error' : ''}">
        <i class="bi bi-file-earmark-spreadsheet"></i>
        <span class="tk-picked-name">${esc(f.fileName)}</span>
        <span class="tk-picked-meta">${fmtSize(f.size)}｜${f.error ? esc(f.error) : f.rows == null ? '讀取中…' : `${num(f.rows)} 筆`}</span>
        <button type="button" class="tk-picked-x" data-i="${i}" aria-label="移除 ${esc(f.fileName)}"><i class="bi bi-x-lg"></i></button>
      </li>`).join('');
    const good = ok();
    go.disabled = !good.length || picked.some((f) => f.rows == null && !f.error);
    go.innerHTML = `<i class="bi bi-upload"></i>上傳${good.length ? `（${good.length} 個檔案，共 ${num(mergeFiles(good).rows)} 筆）` : ''}`;
    pickedEl.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { picked.splice(Number(b.dataset.i), 1); draw(); }; });
  };

  const pick = async (fileList) => {
    err.innerHTML = '';
    const files = [...(fileList ?? [])];
    const bad = files.filter((f) => !isTicketFile(f.name));
    if (bad.length) err.innerHTML = msg(`以下檔案不是 CSV 或 Excel，已略過：${bad.map((f) => esc(f.name)).join('、')}`, 'danger');
    const add = files.filter((f) => isTicketFile(f.name));
    // 同檔名再選一次＝換成新的
    picked = picked.filter((p) => !add.some((f) => f.name === p.fileName));
    const entries = add.map((f) => ({ fileName: f.name, size: f.size, rows: null, error: '', file: f }));
    picked.push(...entries);
    draw();
    await Promise.all(entries.map(async (e) => {
      try {
        const rows = await readRows(e.file);
        if (!rows) e.error = '沒有資料（第一列視為表頭）';
        else e.rows = rows;
      } catch (x) { e.error = `無法讀取：${x.message}`; }
      draw();
    }));
  };
  drop.onclick = () => input.click();
  drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => { pick(input.files); input.value = ''; };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('is-over'); };
  drop.ondragleave = () => drop.classList.remove('is-over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('is-over'); pick(e.dataTransfer.files); };
  go.onclick = () => {
    const good = ok();
    if (!good.length) return;
    const files = good.map(({ fileName, size, rows }) => ({ fileName, size, rows }));
    const res = addTicketUpload(operator.id, quarter, { files, note: root.querySelector('#tk-note').value }, session);
    if (!res.ok) { err.innerHTML = msg(`上傳失敗：${esc(res.error)}`, 'danger'); return; }
    toast(`已上傳 ${files.length} 個檔案（共 ${num(res.upload.rows)} 筆）`);
    renderTicketPage(root, { operator, quarter, session });
  };
}
