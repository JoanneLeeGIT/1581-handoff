// 營運月報與票證資料的填報時程設定（純函式，no DOM）。
// 兩者都依「資料月份」：格子／網址的 YYYY-MM 是資料所屬月份，於之後的月份開放填報、截止。
// 要調整開放日或截止日，只改這裡的 SCHEDULE。

export const SCHEDULE = {
  // 營運月報：10 月資料 → 11/1 開放、11/15 截止（16 日起逾期）；當月月底上架
  report: { monthsAfter: 1, openDay: 1, deadlineDay: 15 },
  // 票證資料：同營運月報；上架另依 ticket.js 的 publishMonth（每季於 2、5、8、11 月底）
  ticket: { monthsAfter: 1, openDay: 1, deadlineDay: 15 },
};

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM' 往後 n 個月 → { year, month } */
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

/** 填報期間：{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }。kind：'report' | 'ticket' */
export function submitWindow(kind, ym) {
  const c = SCHEDULE[kind];
  const { year, month } = addMonths(ym, c.monthsAfter);
  const base = `${year}-${pad(month)}`;
  return { from: `${base}-${pad(c.openDay)}`, to: `${base}-${pad(c.deadlineDay)}` };
}

/** 依日期的狀態（還沒有送出／上傳時）：開放日前＝未開始、期間內＝開放、截止日後＝逾期。today 'YYYY-MM-DD' */
export function windowStatus(kind, ym, today) {
  const w = submitWindow(kind, ym);
  if (today < w.from) return 'notStarted';
  return today <= w.to ? 'open' : 'overdue';
}

/** '2026-11-15' → '2026/11/15' */
export const slashDate = (d) => d.replaceAll('-', '/');

/** 橫幅、說明用的文字：「每月 1–15 日」 */
export const windowText = (kind) => `每月 ${SCHEDULE[kind].openDay}–${SCHEDULE[kind].deadlineDay} 日`;
