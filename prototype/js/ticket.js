// 票證資料（每季上傳檔案，不是線上填報）的純函式規則（no DOM）。
// 每季資料在季結束後的下一個月 1–15 日間上傳：第 1 季 → 4 月、第 2 季 → 7 月、第 3 季 → 10 月、第 4 季 → 隔年 1 月。
// 15 日前未上傳，16 日起顯示逾期；次月底由縣府上架（只有票證資料，準點率由 THI 另外計算）。

export const TICKET_DEADLINE_DAY = 15;

export const TICKET_STATUS = {
  notStarted: '未開始',
  open: '開放上傳',
  overdue: '逾期未繳',
  completed: '已上傳',
};

const pad = (n) => String(n).padStart(2, '0');

/** '2026-Q3' → { year: 2026, q: 3 } */
export function parseQuarter(key) {
  const m = /^(\d{4})-Q([1-4])$/.exec(key ?? '');
  if (!m) return null;
  return { year: Number(m[1]), q: Number(m[2]) };
}

export const quarterKey = (year, q) => `${year}-Q${q}`;

export const quartersOf = (year) => [1, 2, 3, 4].map((q) => quarterKey(year, q));

/** 季的月份範圍文字：'7–9 月' */
export function quarterMonths(key) {
  const { q } = parseQuarter(key);
  return `${q * 3 - 2}–${q * 3} 月`;
}

export function quarterLabel(key) {
  const { year, q } = parseQuarter(key);
  return `${year} 年第 ${q} 季（${quarterMonths(key)}）`;
}

/** 這一季要在哪個月上傳（季結束後的下一個月）：{ year, month } */
export function dueMonth(key) {
  const { year, q } = parseQuarter(key);
  const m = q * 3 + 1; // 4, 7, 10, 13
  return m > 12 ? { year: year + 1, month: m - 12 } : { year, month: m };
}

/** 上傳期間：{ from: 'YYYY-MM-01', to: 'YYYY-MM-15' } */
export function dueWindow(key) {
  const { year, month } = dueMonth(key);
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(TICKET_DEADLINE_DAY)}` };
}

/** 季結束的隔天起就有完整資料，可以先上傳（不必等到上傳期間）。 */
export function availableFrom(key) {
  const { year, q } = parseQuarter(key);
  const m = q * 3 + 1;
  return m > 12 ? `${year + 1}-01-01` : `${year}-${pad(m)}-01`;
}

/** 某業者某季的上傳紀錄，新的在前。 */
export function uploadsFor(uploads, operatorId, key) {
  return (uploads ?? [])
    .filter((u) => u.operatorId === operatorId && u.quarter === key)
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
}

/**
 * 季狀態：有上傳紀錄＝已上傳；否則依日期：上傳月 1 日前＝未開始、1–15 日＝開放上傳、16 日起＝逾期未繳。
 * today 'YYYY-MM-DD'
 */
export function getTicketStatus(list, key, today) {
  if (list?.length) return 'completed';
  const w = dueWindow(key);
  if (today < w.from) return 'notStarted';
  return today <= w.to ? 'open' : 'overdue';
}

/** 是否晚於期限上傳（用上傳時間的日期比對，台灣時間）。 */
export function isLate(upload, key) {
  return localDate(upload.uploadedAt) > dueWindow(key).to;
}

/** ISO 時間 → 台灣日期 'YYYY-MM-DD'（原型固定 UTC+8）。 */
export function localDate(iso) {
  const d = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/** 可以上傳的時機：季已結束（含逾期後補傳、已上傳後更新）。 */
export const canUploadNow = (key, today) => today >= availableFrom(key);

/** 從試算表的列（陣列的陣列）計算資料筆數：略過空白列，第一列視為表頭。 */
export function countDataRows(rows) {
  const filled = (rows ?? []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
  return Math.max(0, filled.length - 1);
}

/** 只接受 Excel／CSV（圖片、PDF、Word 等一律不收）。 */
export const TICKET_FILE_EXT = ['csv', 'xlsx', 'xls'];
export const TICKET_FILE_ACCEPT = '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const isTicketFile = (name) => TICKET_FILE_EXT.includes(String(name ?? '').split('.').pop().toLowerCase()) && /\.[^.]+$/.test(name ?? '');

/** 一次上傳的檔案清單。舊紀錄只有單一 fileName／size／rows，轉成一個檔案。 */
export const uploadFiles = (u) => (u?.files?.length ? u.files : u ? [{ fileName: u.fileName, size: u.size, rows: u.rows }] : []);

/** 把同一批的檔案合併（同檔名以後加入的為準），回傳 { files, rows, size }。 */
export function mergeFiles(files) {
  const map = new Map();
  for (const f of files ?? []) map.set(f.fileName, f);
  const list = [...map.values()];
  return { files: list, rows: list.reduce((s, f) => s + (f.rows ?? 0), 0), size: list.reduce((s, f) => s + (f.size ?? 0), 0) };
}
