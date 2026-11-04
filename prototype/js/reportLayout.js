// 原報表版面的純資料與純函式（不碰 DOM）。
// 依 specs/001-operations-overview-reporting/reference-layout.md：
//   工作表 1「市區汽車客運路線別營運概況」（完整版，固定＋預約兩組，A–AE 共 31 欄）
//   工作表 2「車輛情形＋包車出租」（A–N 共 14 欄）
// 畫面（js/ui/fields.js）只負責把這裡的結構畫成 <table>。

import { GROUPS, STAT_KEYS, isGroupLocked } from './serviceMode.js';
import { FORMULA, sumValues } from './passengerKm.js';

// ---------- 欄位定義 ----------

/** 每組十個統計欄：第 4 列標題、第 5 列單位或子標題、型別。順序＝原表 K–T。 */
export const STAT_COLS = {
  avgSeats: { r4: '平均座位數', r5: '(個)', type: 'int' },
  trips: { r4: '營業行車次數(班次)', r5: '小計', type: 'int' },
  lowFloorTrips: { r4: '營業行車次數(班次)', r5: '低地板公車或具升降設備公車', type: 'int' },
  emptyTrips: { r4: '未載客', r5: '(班次)', type: 'int' },
  operatingKm: { r4: '營業行駛里程', r5: '(車公里)', type: 'dec' },
  passengers: { r4: '客運人數', r5: '(人次)', type: 'int' },
  passengerKm: { r4: '延人公里', r5: '(人公里)', type: 'dec' },
  revenue: { r4: '客運收入', r5: '(新台幣元)', type: 'int' },
  eTicketPassengers: { r4: '電子票證人數', r5: '(人次)', type: 'int' },
  eTicketRevenue: { r4: '電子票證收入', r5: '(新台幣元)', type: 'int' },
};

export const GROUP_TITLE = { fixed: '固定班次部份', reserved: '預約班次部份' };
export const ATTR_KEYS = ['freeFare', 'ruralToUrban', 'happyBus', 'happyTaxi', 'taiwanTrip'];
export const ATTR_TITLE = { freeFare: '免收費', ruralToUrban: '公路轉市區', happyBus: '幸福巴士', happyTaxi: '幸福小黃', taiwanTrip: '台灣好行' };

/** 工作表 1 總欄數：A–J（10）＋固定 10＋預約 10＋備註 1。 */
export const ROUTE_SHEET_COLS = 10 + GROUPS.length * STAT_KEYS.length + 1;
/** 工作表 2 總欄數：A–N。 */
export const VEHICLE_SHEET_COLS = 14;

// ---------- 表頭（合併儲存格以 colspan / rowspan 表示） ----------
// cell: { text, colspan?, rowspan?, kind?: 'sys'|'op'|'group', key? }

/** 只顯示部分組別時的工作表 1 欄數。 */
export const routeSheetCols = (groups = GROUPS) => 10 + groups.length * STAT_KEYS.length + 1;

/** 工作表 1 第 3–5 列三層表頭。groups：要顯示的組別（預設兩組都顯示）。 */
export function routeHeaderRows(groups = GROUPS) {
  const r3 = [
    { text: '路線別', colspan: 2, rowspan: 3, kind: 'sys', key: 'route' },
    { text: '起訖站名稱', colspan: 2, rowspan: 2, kind: 'sys', key: 'od' },
    { text: '月底營業里程', rowspan: 3, kind: 'sys', key: 'monthEndMileage' },
    ...ATTR_KEYS.map((k) => ({ text: ATTR_TITLE[k], rowspan: 3, kind: 'sys', key: k })),
    ...groups.map((g) => ({ text: GROUP_TITLE[g], colspan: STAT_KEYS.length, kind: 'group', key: g })),
    { text: '備註', rowspan: 3, kind: 'op', key: 'note' },
  ];
  const r4 = [];
  const r5 = [{ text: '起站', kind: 'sys', key: 'origin' }, { text: '訖站', kind: 'sys', key: 'destination' }];
  for (const g of groups) {
    for (const k of STAT_KEYS) {
      if (k === 'lowFloorTrips') continue; // L4:M4 合併，已由 trips 帶出
      r4.push(k === 'trips'
        ? { text: STAT_COLS[k].r4, colspan: 2, kind: 'op', key: `${g}.trips` }
        : { text: STAT_COLS[k].r4, kind: 'op', key: `${g}.${k}` });
    }
    for (const k of STAT_KEYS) r5.push({ text: STAT_COLS[k].r5, kind: 'op', key: `${g}.${k}` });
  }
  return [r3, r4, r5];
}

/**
 * 工作表 1 第 6、7 列「填寫說明」：誰填、格式。
 * 說明列是橫向排列，與左邊一格相同時寫「同左」。
 */
export function routeGuideRows(groups = GROUPS) {
  const who = {
    avgSeats: '業者填寫，或由班次明細計算',
    trips: '同左', lowFloorTrips: '同左',
    emptyTrips: '同左（僅幸福巴士可由明細計算）',
    operatingKm: '業者填寫，或由班次明細計算',
    passengers: '同左（僅幸福巴士可由明細計算）',
    passengerKm: `業者填寫，或系統計算${FORMULA.confirmed ? '' : '（公式待縣府確認）'}`,
    revenue: '業者填寫', eTicketPassengers: '同左', eTicketRevenue: '同左',
  };
  const fmt = {
    avgSeats: '必填，整數（取大）', trips: '必填，整數', lowFloorTrips: '同左', emptyTrips: '同左',
    operatingKm: '必填，可有小數', passengers: '必填，整數', passengerKm: '必填，可有小數',
    revenue: '必填，整數', eTicketPassengers: '同左', eTicketRevenue: '同左',
  };
  // 前兩欄（序號、路線編號）凍結，起訖站不凍結，所以說明列第一格只跨兩欄
  const r6 = [
    { text: '系統帶入', colspan: 2, kind: 'sys' },
    { text: '同左', colspan: 2, kind: 'sys' },
    { text: '系統計算：（去程＋返程）÷ 2', kind: 'sys' },
    { text: '系統帶入（每年更新）', colspan: 5, kind: 'sys' },
    ...groups.flatMap((g) => STAT_KEYS.map((k) => ({ text: who[k], kind: 'op', key: `${g}.${k}` }))),
    { text: '業者填寫', kind: 'op' },
  ];
  const r7 = [
    { text: '—', colspan: 2, kind: 'sys' },
    { text: '—', colspan: 2, kind: 'sys' },
    { text: '小數', kind: 'sys' },
    { text: '0／1', colspan: 5, kind: 'sys' },
    ...groups.flatMap((g) => STAT_KEYS.map((k) => ({ text: fmt[k], kind: 'op', key: `${g}.${k}` }))),
    { text: '選填', kind: 'op' },
  ];
  return [r6, r7];
}

/** 工作表 2 表頭。原表第 1–5 列；第 4 列在原表只被上方合併儲存格佔用，畫面上併入第 3 列（結構不變）。 */
export function vehicleHeaderRows() {
  const r1 = [
    { text: '項目', rowspan: 4, kind: 'sys', key: 'item' },
    { text: '車輛情形', colspan: 10, kind: 'sys' },
    { text: '包車出租', colspan: 3, kind: 'op' },
  ];
  const r2 = [
    { text: '營業車輛數(輛)', colspan: 3, kind: 'sys' },
    { text: '電動車輛數', rowspan: 2, kind: 'sys' },
    { text: '無障礙車輛數', rowspan: 2, kind: 'sys' },
    { text: '', kind: 'sys' }, // G2：原表未標示文字（見 待確認.md）
    { text: '行駛延日車數', rowspan: 2, kind: 'sys' },
    { text: '燃料消耗量', colspan: 3, kind: 'sys' },
    { text: '客運人數', colspan: 2, rowspan: 2, kind: 'op' },
    { text: '行駛延日車數', rowspan: 2, kind: 'op' },
  ];
  const r3 = [
    { text: '合計', rowspan: 2, kind: 'sys' },
    { text: '大客車', rowspan: 2, kind: 'sys' },
    { text: '小客車', rowspan: 2, kind: 'sys' },
    { text: '低地板', rowspan: 2, kind: 'sys' },
    { text: '柴油', kind: 'sys' },
    { text: '汽油', kind: 'sys' },
    { text: '液化石油氣', kind: 'sys' },
  ];
  const r5 = [
    { text: '(輛)', kind: 'sys' }, { text: '(輛)', kind: 'sys' }, { text: '(日輛)', kind: 'sys' },
    { text: '(公升)', kind: 'sys' }, { text: '(公升)', kind: 'sys' }, { text: '(度)', kind: 'sys' },
    { text: '(人次)', colspan: 2, kind: 'op' }, { text: '(日輛)', kind: 'op' },
  ];
  return [r1, r2, r3, r5];
}

/** 工作表 2 第 7、8 列說明。 */
export function vehicleGuideRows() {
  return [
    [{ text: '誰填', kind: 'sys' }, { text: '系統帶入', colspan: 10, kind: 'sys' }, { text: '業者填寫', colspan: 3, kind: 'op' }],
    [{ text: '格式', kind: 'sys' }, { text: '—', colspan: 10, kind: 'sys' }, { text: '選填，整數', colspan: 3, kind: 'op' }],
  ];
}

/** 工作表 2 的 B–K 欄依序對應 vehicles 的欄位。 */
export const VEHICLE_KEYS = ['total', 'bus', 'minibus', 'electric', 'accessible', 'lowFloor', 'vehicleDays', 'diesel', 'gasoline', 'lpg'];
/** L–M（合併）、N 對應 charter。 */
export const CHARTER_KEYS = ['passengers', 'vehicleDays'];

/**
 * 檢查合併儲存格排出來的格子是否剛好填滿 width 欄、沒有重疊或缺洞。
 * 回傳 { ok, rowWidths }；用來保證表頭結構與原表欄數一致。
 */
export function checkGrid(rows, width) {
  const occupied = rows.map(() => new Array(width).fill(false));
  let ok = true;
  rows.forEach((row, ri) => {
    let c = 0;
    for (const cell of row) {
      while (c < width && occupied[ri][c]) c += 1;
      const cs = cell.colspan ?? 1;
      const rs = cell.rowspan ?? 1;
      for (let dr = 0; dr < rs; dr += 1) {
        for (let dc = 0; dc < cs; dc += 1) {
          const r = ri + dr;
          const col = c + dc;
          if (r >= rows.length || col >= width || occupied[r][col]) { ok = false; continue; }
          occupied[r][col] = true;
        }
      }
      c += cs;
    }
  });
  const rowWidths = occupied.map((r) => r.filter(Boolean).length);
  return { ok: ok && rowWidths.every((w) => w === width), rowWidths };
}

// ---------- 標題列 ----------

/** 2026-09 → 「11509」（民國年＋兩位月份），同原表第 2 列。 */
export function rocStatPeriod(yearMonth) {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth ?? '');
  if (!m) throw new Error(`invalid yearMonth: ${yearMonth}`);
  return `${Number(m[1]) - 1911}${m[2]}`;
}

export function routeSheetTitle(yearMonth, operatorName) {
  return {
    title: '市區汽車客運路線別營運概況',
    sub: `統計期:${rocStatPeriod(yearMonth)}  縣市別:花蓮縣  客運別:${operatorName}  排序:依路線編號`,
  };
}

// ---------- 儲存格驗證 ----------

/**
 * 解析並驗證一格輸入。type：'int' | 'dec' | 'text'。
 * 數字格允許 Excel 習慣的千分位逗號（1,234）。回傳 {ok:true,value} 或 {ok:false,error}（錯誤訊息為繁中）。
 */
export function parseCell(type, raw, { required = true } = {}) {
  const s = String(raw ?? '').trim();
  if (type === 'text') return { ok: true, value: s };
  if (s === '') return required ? { ok: false, error: '必填' } : { ok: true, value: 0 };
  const plain = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s;
  if (!/^-?\d+(\.\d+)?$/.test(plain)) return { ok: false, error: '須為數字' };
  const n = Number(plain);
  if (n < 0) return { ok: false, error: '不可為負數' };
  if (type === 'int' && !Number.isInteger(n)) return { ok: false, error: '須為整數' };
  return { ok: true, value: n };
}

// ---------- 總計列 ----------

/** 依路線加總固定、預約兩組（FR-022）；鎖定組別一律算 0。 */
export function groupTotals(routes, fieldsRoutes) {
  const out = {};
  for (const g of GROUPS) {
    out[g] = {};
    for (const k of STAT_KEYS) {
      out[g][k] = sumValues(routes.map((r) => (isGroupLocked(r, g) ? 0 : Number(fieldsRoutes?.[r.routeNo]?.[g]?.[k]) || 0)));
    }
  }
  return out;
}

// ---------- 鍵盤移動 ----------

/** 依按鍵算出要移到哪一格（像 Excel：Enter 往下、Shift+Enter 往上、上下鍵）。超出範圍回傳 null。 */
export function moveTarget(row, col, key, shiftKey, rowCount) {
  let d = 0;
  if (key === 'Enter') d = shiftKey ? -1 : 1;
  else if (key === 'ArrowDown') d = 1;
  else if (key === 'ArrowUp') d = -1;
  else return null;
  const r = row + d;
  return r >= 0 && r < rowCount ? { row: r, col } : null;
}
