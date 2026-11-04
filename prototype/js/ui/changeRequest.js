// 變更申請紀錄（FR-018）。業者對已完成月份直接修改後送出，就是一筆變更申請（見 fillForm.js、store.requestChange）。
import { esc, fmtDate } from './common.js';

const OUTCOME = { pending: '待縣府處理', reopened: '已退回待更新', rejected: '已駁回，維持已完成', approved: '已同意更正' };

export function renderChangeHistory(report) {
  const list = report?.changeRequests ?? [];
  if (!list.length) return '';
  const vers = (c) => (c.versionNo ? `第 ${c.baseVersion} 版 → 第 ${c.versionNo} 版｜` : '');
  return `<div class="rpt-block"><h3 class="hb-subtitle">變更申請紀錄</h3><ul class="hb-notes">${list.map((c) =>
    `<li><span class="hb-notes-meta">${fmtDate(c.requestedAt)}｜${vers(c)}${OUTCOME[c.outcome] ?? ''}${c.decidedAt ? `（${fmtDate(c.decidedAt)}）` : ''}</span>${esc(c.reason)}</li>`).join('')}</ul></div>`;
}
