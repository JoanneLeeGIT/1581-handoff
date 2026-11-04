// Pure month-status rules (no DOM). See specs/001-operations-overview-reporting/contracts/status-transitions.md

import { can } from './permissions.js';

export const REVIEW_STATES = ['none', 'reviewing', 'needsUpdate', 'completed', 'changeRequested'];

export const STATUS = {
  notStarted: '未開始',
  open: '開放填報',
  overdue: '逾期未繳',
  reviewing: '檢核中',
  needsUpdate: '待更新',
  completed: '已完成',
  changeRequested: '申請變更',
};

/** Submission deadline: the 10th is still on time, overdue shows from the 11th. */
export const DEADLINE_DAY = 10;

const pad = (n) => String(n).padStart(2, '0');

/**
 * @param report {reviewState}|null
 * @param yearMonth 'YYYY-MM'
 * @param today 'YYYY-MM-DD'
 */
export function getStatus(report, yearMonth, today) {
  const rs = report?.reviewState ?? 'none';
  if (!REVIEW_STATES.includes(rs)) throw new Error(`invalid reviewState: ${rs}`);
  if (rs !== 'none') return rs;
  if (today < `${yearMonth}-01`) return 'notStarted';
  return today <= `${yearMonth}-${pad(DEADLINE_DAY)}` ? 'open' : 'overdue';
}

const TRANSITIONS = {
  submit: { from: ['open', 'overdue', 'needsUpdate', 'reviewing'], to: 'reviewing' },
  markNeedsUpdate: { from: ['reviewing'], to: 'needsUpdate', needs: 'note' },
  markCompleted: { from: ['reviewing'], to: 'completed' },
  // 業者對已完成月份直接修改後送出（存成新版本）；申請變更中可再修改。縣府同意前仍以原版本為準。
  requestChange: { from: ['completed', 'changeRequested'], to: 'changeRequested', needs: 'reason' },
  reopen: { from: ['changeRequested'], to: 'needsUpdate' }, // 退回待更新
  reject: { from: ['changeRequested'], to: 'completed' }, // 駁回，維持已完成（現行版本回到原版本）
  approve: { from: ['changeRequested'], to: 'completed' }, // 同意更正（新版本成為現行版本）
};

/**
 * Apply an action to a report. Returns {ok:true, report} or {ok:false, error}; never mutates input.
 * ctx: { yearMonth, today, operatorId, ownOperatorId, note, reason }
 */
export function applyAction(report, action, role, ctx = {}) {
  const t = TRANSITIONS[action];
  if (!t) return { ok: false, error: `unknown action: ${action}` };
  if (!can(role, action, ctx)) return { ok: false, error: `role ${role} may not ${action}` };

  const status = getStatus(report, ctx.yearMonth, ctx.today);
  if (!t.from.includes(status)) {
    return { ok: false, error: `cannot ${action} while status is ${status}` };
  }
  if (t.needs && !String(ctx[t.needs] ?? '').trim()) {
    return { ok: false, error: `${t.needs} is required` };
  }
  return { ok: true, report: { ...(report ?? {}), reviewState: t.to } };
}
