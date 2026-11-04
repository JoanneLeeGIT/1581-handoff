// 月報本體：照原報表畫成 Excel 般的寬表格，填報畫面（mode=edit）與檢視／檢核畫面（mode=view）共用。
// 版面結構（表頭、合併儲存格、說明列）定義在 ../reportLayout.js；這裡只負責畫與互動。
// 樣式用 huabus-theme.css 的「報表式表格」（table.hb-sheet，樣張見 styleguide.html）。
import { GROUPS, STAT_KEYS, isGroupLocked, getEditableGroups, zeroGroup, visibleGroups } from '../serviceMode.js';
import { FORMULA, computePassengerKm, sumValues } from '../passengerKm.js';
import {
  STAT_COLS, GROUP_TITLE, ATTR_KEYS, ATTR_TITLE, VEHICLE_KEYS,
  routeHeaderRows, routeGuideRows, vehicleHeaderRows, vehicleGuideRows,
  routeSheetTitle, rocStatPeriod, parseCell, groupTotals, moveTarget,
} from '../reportLayout.js';
import { esc, fmtNum } from './common.js';

export const MODE_LABEL = { fixed: '固定班次', reserved: '預約班次', both: '固定＋預約' };
/** 舊名稱相容：其他模組仍可用 GROUP_LABEL。 */
export const GROUP_LABEL = GROUP_TITLE;

const KM_SRC = {
  computed: { short: '系統計算', next: 'manual' },
  manual: { short: '自行填寫', next: 'computed' },
};

// 延人公里來源圖示：圓角線條、少筆畫。計算機＝圓角機身＋螢幕一橫＋兩顆按鍵；鉛筆＝圓頭筆身＋筆尖一小點。
const SVG_CALC = '<svg class="km-ic km-ic-calc" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="2.5" width="12" height="15" rx="3.5"/><path d="M7.5 6.5h5"/><circle cx="8" cy="11" r=".6"/><circle cx="12" cy="11" r=".6"/><circle cx="8" cy="14" r=".6"/><circle cx="12" cy="14" r=".6"/></svg>';
const SVG_PEN = '<svg class="km-ic km-ic-pen" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.8 4.2a1.9 1.9 0 0 1 2.7 2.7l-8 8-3.5.8.8-3.5z"/><path d="M11.3 5.7l2.9 2.9"/></svg>';
/** 兩個圖示疊在一起，切換時用 CSS 做轉場（旋轉＋彈性縮放），見 huabus-theme.css .hb-kmtoggle。 */
export const KM_ICONS = `${SVG_CALC}${SVG_PEN}`;
const kmMini = (src) => `<span class="km-src-icon" data-source="${src}" title="延人公里：${KM_SRC[src].short}">${src === 'manual' ? SVG_PEN : SVG_CALC}</span>`;
const kmTitle = (src) => `延人公里：${KM_SRC[src].short}${src === 'computed' ? `（${FORMULA.label}${FORMULA.confirmed ? '' : '，公式待縣府確認'}）` : ''}。按一下切換`;

const statLabel = (k) => (k === 'trips' ? '營業行車次數小計' : k === 'lowFloorTrips' ? '營業行車次數低地板公車或具升降設備公車' : STAT_COLS[k].r4);
const cellAria = (r, g, k) => `路線 ${r.routeNo} ${GROUP_TITLE[g]} ${statLabel(k)}`;

// ---------- 留言定位：每個可留言的格子帶 data-anchor（任務留言板用，見 threadBoard.js） ----------
const SHORT_STAT = { trips: '營業行車次數', lowFloorTrips: '低地板班次', avgSeats: '平均座位數', emptyTrips: '未載客班次' };
const SHORT_GROUP = { fixed: '固定班次', reserved: '預約班次' };
const anchorAttr = (path) => ` data-anchor="${esc(path)}"`;

/** 留言位置的顯示名稱：例「路線 U2-02｜固定班次｜電子票證人數」。path 為空＝整份月報。 */
export function anchorLabel(path) {
  if (!path) return '整份月報';
  const [head, a, b, c] = path.split('.');
  if (head === 'routes') {
    if (!b) return `路線 ${a}（整列）`;
    return `路線 ${a}｜${SHORT_GROUP[b] ?? b}｜${SHORT_STAT[c] ?? STAT_COLS[c]?.r4 ?? c}`;
  }
  if (head === 'routeNotes') return `路線 ${a}｜備註`;
  if (head === 'charter') return `包車出租｜${a === 'passengers' ? '客運人數' : '行駛延日車數'}`;
  if (head === 'vehicles') return '車輛情形';
  return path;
}

// ---------- 共用：表頭儲存格 ----------

// 工作表 1 前四欄（序號、路線編號、起站、訖站）凍結；用 class 指定 left 位置。
// 只凍結序號、路線編號（起訖站跟著捲動，可閱讀的區域比較大）
const FREEZE_BY_KEY = { route: 'frz frz-a frz-last' };

function th(cell, { freeze = '' } = {}) {
  const span = `${cell.colspan > 1 ? ` colspan="${cell.colspan}"` : ''}${cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ''}`;
  const scope = cell.colspan > 1 ? 'colgroup' : 'col';
  const isUnit = /^\(.*\)$/.test(cell.text);
  const cls = [cell.kind === 'group' ? 'is-group' : '', isUnit ? 'is-unit' : '', freeze].filter(Boolean).join(' ');
  const text = cell.kind === 'group' ? `<span class="group-label">${esc(cell.text)}</span>` : esc(cell.text);
  return `<th scope="${scope}"${span}${cls ? ` class="${cls}"` : ''}>${text}</th>`;
}

function guideTd(cell, freeze = '') {
  const span = cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
  return `<td${span} class="is-guide ${freeze}">${esc(cell.text)}</td>`;
}

// ---------- 工作表 1：路線別營運概況 ----------

function colgroup1(groups) {
  const statW = { avgSeats: 5, trips: 5, lowFloorTrips: 6.4, emptyTrips: 4.6, operatingKm: 6.4, passengers: 5.6, passengerKm: 8, revenue: 7, eTicketPassengers: 5.8, eTicketRevenue: 7 };
  const w = ['var(--wA)', 'var(--wB)', 'var(--wC)', 'var(--wD)', '5.6rem', ...ATTR_KEYS.map(() => '3.4rem'),
    ...groups.flatMap(() => STAT_KEYS.map((k) => `${statW[k]}rem`)), '10rem'];
  return `<colgroup>${w.map((x) => `<col style="width:${x}">`).join('')}</colgroup>`;
}

function routeHead(groups) {
  const [r3, r4, r5] = routeHeaderRows(groups);
  const row = (cells) => `<tr>${cells.map((c) => th(c, { freeze: FREEZE_BY_KEY[c.key] ?? '' })).join('')}</tr>`;
  return `<thead>${row(r3)}${row(r4)}${row(r5)}</thead>`;
}

function guideRows1(groups) {
  return routeGuideRows(groups).map((cells, i) => `<tr class="guide-row" data-guide="${i === 0 ? 'who' : 'format'}">${
    cells.map((c, ci) => guideTd(c, ci === 0 ? 'frz frz-a frz-last' : '')).join('')}</tr>`).join('');
}

function sysTd(v, cls = '') {
  return `<td class="is-sys num ${cls}">${fmtNum(v ?? 0)}</td>`;
}

function editStatCell(r, g, k, vals, rowIdx, colIdx) {
  const v = vals?.[k];
  const type = STAT_COLS[k].type;
  const base = `data-route="${esc(r.routeNo)}" data-group="${g}" data-key="${k}" data-type="${type}" data-row="${rowIdx}" data-col="${colIdx}"`;
  const mode = type === 'int' ? 'numeric' : 'decimal';
  if (k === 'passengerKm') {
    const src = vals?.passengerKmSource === 'manual' ? 'manual' : 'computed';
    return `<td class="is-op num km-td"${anchorAttr(`routes.${r.routeNo}.${g}.${k}`)}><div class="hb-kmcell">
      <button type="button" class="hb-kmtoggle" data-route="${esc(r.routeNo)}" data-group="${g}" data-source="${src}" tabindex="-1"
        title="${esc(kmTitle(src))}" aria-label="${esc(kmTitle(src))}">${KM_ICONS}</button>
      <input class="hb-cellinput stat" ${base} inputmode="${mode}" autocomplete="off" aria-label="${esc(cellAria(r, g, k))}" value="${esc(v ?? '')}" ${src === 'computed' ? 'readonly tabindex="-1"' : ''}>
    </div></td>`;
  }
  return `<td class="is-op num"${anchorAttr(`routes.${r.routeNo}.${g}.${k}`)}><input class="hb-cellinput stat" ${base} inputmode="${mode}" autocomplete="off" aria-label="${esc(cellAria(r, g, k))}" value="${esc(v ?? '')}"></td>`;
}

function viewStatCell(r, g, k, vals, changed) {
  const path = `routes.${r.routeNo}.${g}.${k}`;
  const diff = changed?.has(path) || (k === 'passengerKm' && changed?.has(`routes.${r.routeNo}.${g}.passengerKmSource`));
  let extra = '';
  if (k === 'passengerKm') {
    extra = kmMini(vals?.passengerKmSource === 'manual' ? 'manual' : 'computed');
  }
  return `<td class="num ${diff ? 'is-diff' : ''}" data-path="${esc(path)}"${anchorAttr(path)} ${diff ? 'title="與前一版不同"' : ''}>${extra}${fmtNum(vals?.[k] ?? 0)}</td>`;
}

function routeRow(r, idx, fields, { mode, changed, groups }) {
  const stats = fields?.routes?.[r.routeNo] ?? {};
  const note = fields?.routeNotes?.[r.routeNo] ?? '';
  const a = r.attrs ?? {};
  let col = 0;
  const cells = groups.flatMap((g) => STAT_KEYS.map((k) => {
    col += 1;
    if (isGroupLocked(r, g)) {
      return `<td class="is-locked num"${anchorAttr(`routes.${r.routeNo}.${g}.${k}`)} title="此路線沒有「${GROUP_TITLE[g]}」，系統鎖定為 0">0</td>`;
    }
    return mode === 'edit' ? editStatCell(r, g, k, stats[g], idx, col) : viewStatCell(r, g, k, stats[g], changed);
  }));
  const notePath = `routeNotes.${r.routeNo}`;
  const noteCell = mode === 'edit'
    ? `<td class="is-op"${anchorAttr(notePath)}><input class="hb-cellinput route-note" data-route="${esc(r.routeNo)}" data-row="${idx}" data-col="${col + 1}" aria-label="路線 ${esc(r.routeNo)} 備註" value="${esc(note)}"></td>`
    : `<td class="note-text ${changed?.has(notePath) ? 'is-diff' : ''}"${anchorAttr(notePath)}>${esc(note)}</td>`;
  return `<tr data-route="${esc(r.routeNo)}">
    <td class="is-sys num frz frz-a">${idx + 1}</td>
    <th scope="row" class="is-sys frz frz-b frz-last"${anchorAttr(`routes.${r.routeNo}`)} title="服務模式：${MODE_LABEL[r.serviceModes] ?? ''}">${esc(r.routeNo)}</th>
    <td class="is-sys od">${esc(r.origin)}</td>
    <td class="is-sys od">${esc(r.destination)}</td>
    ${sysTd(r.monthEndMileage)}
    ${ATTR_KEYS.map((k) => `<td class="is-sys num" title="${ATTR_TITLE[k]}">${a[k] ?? 0}</td>`).join('')}
    ${cells.join('')}
    ${noteCell}
  </tr>`;
}

function routeFoot(operator, fields, groups) {
  const t = groupTotals(operator.routes, fields?.routes);
  return `<tfoot><tr>
    <th scope="row" colspan="2" class="frz frz-a frz-last">總計</th>
    <td colspan="8"></td>
    ${groups.flatMap((g) => STAT_KEYS.map((k) => `<td class="num" data-total="${g}.${k}">${fmtNum(t[g][k])}</td>`)).join('')}
    <td></td></tr></tfoot>`;
}

function routeSheet(operator, fields, { mode, changed, yearMonth }) {
  const groups = visibleGroups(operator.routes);
  const { title, sub } = routeSheetTitle(yearMonth, operator.name);
  return `<div class="hb-sheetwrap sheet-routes-wrap" tabindex="-1" role="region" aria-label="路線別營運概況表格（可左右捲動）">
      <table class="hb-sheet sheet-routes">
        <caption class="visually-hidden">${esc(title)}，${esc(sub)}</caption>
        ${colgroup1(groups)}${routeHead(groups)}
        <tbody>${guideRows1(groups)}${operator.routes.map((r, i) => routeRow(r, i, fields, { mode, changed, groups })).join('')}</tbody>
        ${routeFoot(operator, fields, groups)}
      </table>
    </div>`;
}

// ---------- 工作表 2：車輛情形＋包車出租 ----------

function vehicleSheet(operator, fields, { mode, changed }) {
  const v = operator.vehicles ?? {};
  const c = fields?.charter ?? {};
  // 「項目」欄凍結（左右捲動時固定在左側）
  const head = vehicleHeaderRows().map((cells) => `<tr>${cells.map((x) => th(x, { freeze: x.key === 'item' ? 'frz frz-a frz-last' : '' })).join('')}</tr>`).join('');
  const guide = vehicleGuideRows().map((cells) => `<tr class="guide-row">${cells.map((x, i) => guideTd(x, i === 0 ? 'frz frz-a frz-last' : '')).join('')}</tr>`).join('');
  const vCells = VEHICLE_KEYS.map((k) => sysTd(v[k])).join('');
  const charterCell = (k, colspan) => {
    const span = colspan ? ` colspan="${colspan}"` : '';
    if (mode === 'edit') {
      const label = k === 'passengers' ? '包車出租 客運人數' : '包車出租 行駛延日車數';
      return `<td class="is-op num"${span}${anchorAttr(`charter.${k}`)}><input class="hb-cellinput charter" data-key="${k}" data-type="int" data-required="false" placeholder="0" data-row="0" data-col="${k === 'passengers' ? 1 : 2}" inputmode="numeric" autocomplete="off" aria-label="${label}" value="${esc(c[k] ?? '')}"></td>`;
    }
    const diff = changed?.has(`charter.${k}`);
    return `<td class="num ${diff ? 'is-diff' : ''}"${span}${anchorAttr(`charter.${k}`)}>${fmtNum(c[k] ?? 0)}</td>`;
  };
  const totalCharter = (k, colspan) => `<td class="num"${colspan ? ` colspan="${colspan}"` : ''} data-total="charter.${k}">${fmtNum(Number(c[k]) || 0)}</td>`;
  return `<div class="hb-sheetwrap" tabindex="-1" role="region" aria-label="車輛情形及包車出租表格">
      <table class="hb-sheet sheet-vehicles">
        <colgroup><col style="width:10rem">${VEHICLE_KEYS.map(() => '<col style="width:5rem">').join('')}<col style="width:3.6rem"><col style="width:3.6rem"><col style="width:6rem"></colgroup>
        <thead>${head}</thead>
        <tbody>
          <tr class="is-total"><th scope="row" class="frz frz-a frz-last">總計</th>${VEHICLE_KEYS.map((k) => `<td class="num">${fmtNum(v[k] ?? 0)}</td>`).join('')}${totalCharter('passengers', 2)}${totalCharter('vehicleDays')}</tr>
          ${guide}
          <tr><th scope="row" class="is-sys frz frz-a frz-last"${anchorAttr('vehicles')}>${esc(operator.name)}</th>${vCells}${charterCell('passengers', 2)}${charterCell('vehicleDays')}</tr>
        </tbody>
      </table>
    </div>`;
}

// ---------- 月報本體：兩張表放在同一頁 ----------

function keys(mode, diffCount, diffBase) {
  const items = [
    '<span><i class="hb-sw is-sys"></i>系統帶入</span>',
    `<span><i class="hb-sw"></i>${mode === 'edit' ? '請填寫' : '業者填寫'}</span>`,
    '<span><i class="hb-sw is-locked"></i>不適用</span>',
  ];
  if (diffCount !== undefined) items.push(`<span><i class="hb-sw is-diff"></i>與${diffBase ? `第 ${diffBase} 版` : '前一版'}不同${diffCount ? `（${diffCount} 處）` : '（無）'}</span>`);
  return `<div class="hb-keys">${items.join('')}</div>`;
}

/**
 * 月報本體，對應原檔工作表 1、2，上下排在同一頁。
 * mode：'edit'（填報）或 'view'（唯讀，changed 內的路徑標色）。diffCount：檢視時有前一版才傳。
 * 「填寫說明」列預設收合，由頁首的 .guide-toggle 按鈕切換（bindGuideToggle）。
 */
export function renderReportSheets(operator, fields, { mode, changed, yearMonth, diffCount, diffBase, guideOpen = false, topBar = '' }) {
  return `<div class="report-sheets ${guideOpen ? 'show-guide' : ''}">
    ${topBar}
    <section class="rpt-sec">
      <div class="rpt-sec-head">
        <h2 class="hb-subtitle">路線別營運概況<span class="rpt-meta">統計期 ${rocStatPeriod(yearMonth)}</span></h2>
        ${keys(mode, diffCount, diffBase)}
      </div>
      ${routeSheet(operator, fields, { mode, changed, yearMonth })}
    </section>
    <section class="rpt-sec">
      <div class="rpt-sec-head"><h2 class="hb-subtitle">車輛情形及包車出租</h2></div>
      ${vehicleSheet(operator, fields, { mode, changed })}
    </section>
  </div>`;
}

/** 「填寫說明」列收合／展開（兩張表一起）。 */
export function bindGuideToggle(root) {
  const wrap = root.querySelector('.report-sheets');
  const btn = root.querySelector('.guide-toggle');
  if (!wrap || !btn) return;
  btn.addEventListener('click', () => {
    const open = !wrap.classList.contains('show-guide');
    wrap.classList.toggle('show-guide', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('is-on', open);
  });
}

/** 總計（FR-022）；保留舊介面給其他模組。 */
export function totalsOf(operator, fields) {
  return groupTotals(operator.routes, fields?.routes);
}

// ---------- 填報互動 ----------

function input(root, route, group, key) {
  return root.querySelector(`input.stat[data-route="${CSS.escape(route)}"][data-group="${group}"][data-key="${key}"]`);
}
function kmToggle(root, route, group) {
  return root.querySelector(`.hb-kmtoggle[data-route="${CSS.escape(route)}"][data-group="${group}"]`);
}

function setKmSource(btn, src) {
  btn.dataset.source = src; // 圖示切換與動畫由 CSS 依 data-source 處理
  btn.title = kmTitle(src);
  btn.setAttribute('aria-label', kmTitle(src));
}

/** 延人公里系統計算、總計列即時加總。 */
export function recompute(root, operator) {
  for (const r of operator.routes) {
    for (const g of getEditableGroups(r)) {
      const btn = kmToggle(root, r.routeNo, g);
      const km = input(root, r.routeNo, g, 'passengerKm');
      if (!km) continue;
      const td = km.closest('td');
      if (btn?.dataset.source === 'computed') {
        const pax = parseCell('int', input(root, r.routeNo, g, 'passengers').value);
        const res = pax.ok ? computePassengerKm({ source: 'computed', passengers: pax.value, monthEndMileage: r.monthEndMileage }) : { ok: false };
        km.value = res.ok ? res.value : '';
        km.readOnly = true;
        km.tabIndex = -1;
        km.classList.remove('is-invalid');
        td?.classList.remove('is-error');
        td?.classList.add('is-sys');
      } else {
        km.readOnly = false;
        km.removeAttribute('tabindex');
        td?.classList.remove('is-sys');
      }
    }
  }
  for (const g of GROUPS) {
    for (const k of STAT_KEYS) {
      const sum = sumValues(operator.routes.map((r) => {
        if (isGroupLocked(r, g)) return 0;
        const p = parseCell(STAT_COLS[k].type, input(root, r.routeNo, g, k)?.value);
        return p.ok ? p.value : 0;
      }));
      const cell = root.querySelector(`[data-total="${g}.${k}"]`);
      if (cell) cell.textContent = fmtNum(sum);
    }
  }
  root.querySelectorAll('input.charter').forEach((el) => {
    const p = parseCell('int', el.value, { required: false });
    const cell = root.querySelector(`[data-total="charter.${el.dataset.key}"]`);
    if (cell) cell.textContent = fmtNum(p.ok ? p.value : 0);
  });
}

/** 驗證單一儲存格並標紅；回傳解析結果。 */
export function validateInput(el) {
  const td = el.closest('td');
  if (el.readOnly) { el.classList.remove('is-invalid'); td?.classList.remove('is-error'); return { ok: true, value: Number(el.value) || 0 }; }
  const res = parseCell(el.dataset.type, el.value, { required: el.dataset.required !== 'false' });
  el.classList.toggle('is-invalid', !res.ok);
  td?.classList.toggle('is-error', !res.ok);
  if (res.ok) el.removeAttribute('title'); else el.title = res.error;
  el.setAttribute('aria-invalid', String(!res.ok));
  return res;
}

/** 讀表單＋驗證。成功 {ok:true, fields}；失敗 {ok:false, errors, first, messages, els（與 messages 對應的輸入框）}。 */
export function collectFields(root, operator) {
  const messages = [];
  const els = [];
  let first = null;
  const check = (el, label) => {
    const res = validateInput(el);
    if (!res.ok) { messages.push(`${label}：${res.error}`); els.push(el); first ??= el; }
    return res.value;
  };
  const routes = {};
  const routeNotes = {};
  for (const r of operator.routes) {
    routes[r.routeNo] = {};
    for (const g of GROUPS) {
      if (isGroupLocked(r, g)) { routes[r.routeNo][g] = zeroGroup(); continue; }
      const o = {};
      for (const k of STAT_KEYS) o[k] = check(input(root, r.routeNo, g, k), cellAria(r, g, k));
      o.passengerKmSource = kmToggle(root, r.routeNo, g)?.dataset.source === 'manual' ? 'manual' : 'computed';
      routes[r.routeNo][g] = o;
    }
    routeNotes[r.routeNo] = root.querySelector(`.route-note[data-route="${CSS.escape(r.routeNo)}"]`)?.value.trim() ?? '';
  }
  const charter = {};
  root.querySelectorAll('input.charter').forEach((el) => {
    charter[el.dataset.key] = check(el, el.getAttribute('aria-label'));
  });
  return messages.length
    ? { ok: false, errors: messages.length, first, messages, els }
    : { ok: true, fields: { routes, routeNotes, charter } };
}

/**
 * 從班次明細帶入（FR-021）：只對有班次明細的業者顯示。
 * 回傳 { changed, overwritten, undo }：changed＝實際改到的格數、overwritten＝其中原本已有數字的格數，
 * undo() 把帶入前的數字放回去（帶入後業者又自己改過的格子不動）。
 */
export function importShiftDetail(root, operator) {
  const withPassengers = operator.type === 'happybus' && operator.happybusVersion === '1.0';
  const log = [];
  for (const r of operator.routes) {
    for (const g of getEditableGroups(r)) {
      const d = operator.shiftDetail?.[r.routeNo]?.[g];
      if (!d) continue;
      const set = (k, v) => {
        const el = input(root, r.routeNo, g, k);
        if (!el || v === undefined || el.value === String(v)) return;
        log.push({ el, prev: el.value, next: String(v) });
        el.value = v;
        validateInput(el);
        el.closest('td')?.classList.add('is-filled');
      };
      set('trips', d.trips); set('lowFloorTrips', d.lowFloorTrips); set('operatingKm', d.operatingKm);
      if (withPassengers) { set('passengers', d.passengers); set('emptyTrips', d.emptyTrips); }
    }
  }
  recompute(root, operator);
  const undo = () => {
    let restored = 0;
    for (const { el, prev, next } of log) {
      if (el.value !== next) continue;
      el.value = prev;
      el.closest('td')?.classList.remove('is-filled');
      if (prev === '') { el.classList.remove('is-invalid'); el.closest('td')?.classList.remove('is-error'); } else validateInput(el);
      restored += 1;
    }
    recompute(root, operator);
    return restored;
  };
  return { changed: log.length, overwritten: log.filter((x) => x.prev !== '').length, undo };
}

/** 填報進度：必填格（不含系統計算的延人公里）已填幾格、有幾格錯誤。 */
export function fillProgress(root) {
  const cells = [...root.querySelectorAll('input.stat')].filter((el) => !el.readOnly);
  return {
    total: cells.length,
    filled: cells.filter((el) => el.value.trim() !== '').length,
    errors: root.querySelectorAll('td.is-error').length,
  };
}

const focusCell = (el) => { el.focus(); el.select(); };

/**
 * 左右鍵：游標在格子最左（或最右）、或整格內容已選取時才換格，否則照常在文字裡移動游標。
 * 唯讀格（例如系統計算的延人公里）與鎖定格會跳過。
 */
function moveHorizontal(el, key) {
  const len = el.value.length;
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? 0;
  const allSelected = s === 0 && e === len;
  const atEdge = key === 'ArrowLeft' ? s === 0 && e === 0 : s === len && e === len;
  if (!allSelected && !atEdge) return false;
  const cells = [...el.closest('tr').querySelectorAll('input.hb-cellinput')].filter((x) => !x.readOnly);
  const next = cells[cells.indexOf(el) + (key === 'ArrowRight' ? 1 : -1)];
  if (next) focusCell(next);
  return true;
}

/** 填報表格的互動：延人公里切換、逐格驗證、方向鍵／Enter 移動。 */
export function bindSheetInteractions(root, operator, onChange) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.hb-kmtoggle');
    if (!btn) return;
    setKmSource(btn, KM_SRC[btn.dataset.source]?.next ?? 'computed');
    recompute(root, operator);
    if (btn.dataset.source === 'manual') focusCell(input(root, btn.dataset.route, btn.dataset.group, 'passengerKm'));
    onChange?.();
  });
  root.addEventListener('focusout', (e) => {
    if (e.target.matches('input.stat, input.charter')) validateInput(e.target);
  });
  root.addEventListener('keydown', (e) => {
    const el = e.target;
    if (!el.matches?.('input.hb-cellinput')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (moveHorizontal(el, e.key)) e.preventDefault();
      return;
    }
    if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault(); // 不讓 Enter 直接送出表單
    const table = el.closest('table');
    const rowCount = table.querySelectorAll('tbody tr[data-route]').length || 1;
    const col = el.dataset.col;
    let pos = { row: Number(el.dataset.row), col };
    for (;;) {
      pos = moveTarget(pos.row, col, e.key, e.shiftKey, rowCount);
      if (!pos) return;
      const next = table.querySelector(`input.hb-cellinput[data-row="${pos.row}"][data-col="${col}"]`);
      if (next && !next.readOnly) { focusCell(next); return; }
    }
  });
}
