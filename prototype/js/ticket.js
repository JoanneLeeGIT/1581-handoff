// 票證資料（每月上傳檔案，不是線上填報）的純函式規則（no DOM）。
// 每月資料在下個月 1–15 日間上傳（例：10 月資料 → 11/1–11/15）；15 日前未上傳，16 日起顯示逾期。
// 上架每季一次：季結束後的次月底（2、5、8、11 月底）上架該季資料（第 1 季 → 5 月底、第 2 季 → 8 月底、第 3 季 → 11 月底、第 4 季 → 隔年 2 月底）。
// 只有票證資料，準點率由 THI 另外計算。幸福巴士暫不納入票證資料。

import { SCHEDULE, submitWindow, windowStatus, addMonths } from './schedule.js';

/** 截止日（每月幾日）；時程設定集中在 schedule.js。 */
export const TICKET_DEADLINE_DAY = SCHEDULE.ticket.deadlineDay;

export const TICKET_STATUS = {
  notStarted: '未開始',
  open: '開放上傳',
  overdue: '逾期未繳',
  completed: '已上傳',
};

/** 哪些業者要上傳票證資料：幸福巴士暫不納入。 */
export const needsTicket = (op) => Boolean(op) && op.type !== 'happybus';

/** 'YYYY-MM' → { year, month }；格式不對回傳 null */
export function parseMonth(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(key ?? '');
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}


/** '2026-10' → '2026 年 10 月' */
export function monthLabel(key) {
  const { year, month } = parseMonth(key);
  return `${year} 年 ${month} 月`;
}

/** 這個月的資料要在哪個月上傳（依 schedule.js，目前是下個月）：{ year, month } */
export const dueMonth = (key) => addMonths(key, SCHEDULE.ticket.monthsAfter);

/** 上傳期間：{ from: 'YYYY-MM-01', to: 'YYYY-MM-15' } */
export const dueWindow = (key) => submitWindow('ticket', key);

/** 月結束的隔天起就有完整資料，可以上傳。 */
export const availableFrom = (key) => dueWindow(key).from;

/** 這個月的資料在哪個月底上架：所屬季結束後的第二個月（上傳月的次月）。{ year, month } */
export function publishMonth(key) {
  const { month } = parseMonth(key);
  const quarterEnd = Math.ceil(month / 3) * 3;
  return addMonths(key, quarterEnd - month + 2);
}

/** 某業者某月的上傳紀錄，新的在前。 */
export function uploadsFor(uploads, operatorId, key) {
  return (uploads ?? [])
    .filter((u) => u.operatorId === operatorId && u.month === key)
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
}

/**
 * 月狀態：有上傳紀錄＝已上傳；否則依日期：下個月 1 日前＝未開始、1–15 日＝開放上傳、16 日起＝逾期未繳。
 * today 'YYYY-MM-DD'
 */
export function getTicketStatus(list, key, today) {
  if (list?.length) return 'completed';
  return windowStatus('ticket', key, today);
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

/** 可以上傳的時機：該月已結束（含逾期後補傳、已上傳後更新）。 */
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
