// localStorage-backed demo store. All business rules live in the pure modules; this file only persists
// and wires them together. Every storage access is wrapped in try/catch (page still works from memory).

import { getToday } from './clock.js';
import { applyAction } from './status.js';
import { addVersion } from './versions.js';
import { can } from './permissions.js';
import { createThread, replyThread, setThreadStatus, toggleReaction, resolveAll, openThreads, latestComment, migrateNotes } from './threads.js';
import { isTicketFile, mergeFiles, needsTicket } from './ticket.js';

const STATE_KEY = 'huabus-proto-state-v2'; // v2：業者與路線改用實際名稱，舊瀏覽器資料不沿用
const SESSION_KEY = 'huabus-proto-session';
let state = null;

/** 舊資料的檔案備註／檢核備註轉成任務留言（見 threads.js）。 */
function normalize(s) {
  if (s?.reports) s.reports = s.reports.map((r) => migrateNotes(r, { countyName: `${COUNTY_USER}（縣府）` }));
  return s;
}

let saveOk = true;
function persist() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); saveOk = true; } catch { saveOk = false; /* keep in memory */ }
  return saveOk;
}
/** 上一次寫入瀏覽器儲存空間是否成功（附件太大時可能失敗，資料只留在這個分頁）。 */
export const lastSaveOk = () => saveOk;

async function loadSeed() {
  const res = await fetch(new URL('../data/seed.json', import.meta.url));
  if (!res.ok) throw new Error(`seed.json: ${res.status}`);
  return res.json();
}

export async function initStore() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      state = normalize(JSON.parse(raw));
      // 舊的瀏覽器資料還沒有票證資料，或還是每季的紀錄（沒有 month）：換成示範的每月上傳紀錄
      if (!state.ticketUploads || state.ticketUploads.some((u) => !u.month)) { try { state.ticketUploads = (await loadSeed()).ticketUploads ?? []; } catch { state.ticketUploads = []; } }
      persist();
      return state;
    }
  } catch { /* fall through to seed */ }
  state = normalize(await loadSeed());
  persist();
  return state;
}

/** Re-read from storage (another tab may have written). Returns true if something changed. */
export function reload() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw && raw !== JSON.stringify(state)) { state = normalize(JSON.parse(raw)); return true; }
  } catch { /* ignore */ }
  return false;
}

export async function resetDemo() {
  try { localStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
  state = normalize(await loadSeed());
  persist();
}

// ---- session (prototype only: role switch instead of login) ----
export function getSession() {
  try {
    const v = localStorage.getItem(SESSION_KEY);
    if (v === 'readonly') return { role: 'readonly' };
    if (v?.startsWith('operator:')) {
      const operatorId = v.slice(9);
      if (state?.operators.some((o) => o.id === operatorId)) return { role: 'operator', operatorId };
    }
  } catch { /* default below */ }
  return { role: 'county' };
}

export function setSession(value) {
  try { localStorage.setItem(SESSION_KEY, value); } catch { /* ignore */ }
}

/** 原型的縣府使用者（導覽列底部與版本「儲存者」共用）。 */
export const COUNTY_USER = 'LinLin';

/** 原型的縣府人員（可被 @ 提及）。第一位是目前登入的縣府使用者。全部為假資料。 */
export const COUNTY_STAFF = [
  { name: 'LinLin', title: '縣府交通科' },
  { name: '陳承辦', title: '縣府交通科' },
];

/** 這份月報可以 @ 的對象：縣府人員＋該業者。 */
export function mentionPeople(operatorId) {
  const op = getOperator(operatorId);
  return [
    ...COUNTY_STAFF.map((p) => ({ ...p, role: 'county' })),
    ...(op ? [{ name: op.name, title: '營運業者', role: 'operator' }] : []),
  ];
}

/** 目前使用者被 @ 時的名稱（「提及我」分頁用）。唯讀單位不會被提及。 */
export function myMentionName(session) {
  if (session.role === 'operator') return getOperator(session.operatorId)?.name ?? null;
  if (session.role === 'county') return COUNTY_USER;
  return null;
}

/** 目前登入者的顯示名稱：業者＝業者名稱，縣府＝人名（單位）。 */
export function userName(session) {
  if (session.role === 'operator') return getOperator(session.operatorId)?.name ?? '';
  if (session.role === 'county') return `${COUNTY_USER}（縣府）`;
  return '唯讀單位';
}

export function sessionValue() {
  const s = getSession();
  return s.role === 'operator' ? `operator:${s.operatorId}` : s.role;
}

// ---- reads ----
export const getOperators = () => state.operators;
export const getOperator = (id) => state.operators.find((o) => o.id === id) ?? null;
export const getReport = (operatorId, yearMonth) =>
  state.reports.find((r) => r.operatorId === operatorId && r.yearMonth === yearMonth) ?? null;
export const getAllReports = () => state.reports;

export function entriesFor(yearMonth) {
  return state.reports
    .filter((r) => r.yearMonth === yearMonth)
    .map((report) => ({ operator: getOperator(report.operatorId), report }))
    .filter((e) => e.operator);
}

export function availableMonths() {
  return [...new Set(state.reports.map((r) => r.yearMonth))].sort().reverse();
}

// ---- writes ----
function ctxFor(operatorId, yearMonth, session, extra = {}) {
  return { operatorId, ownOperatorId: session.operatorId, yearMonth, today: getToday(), ...extra };
}

function saveReport(operatorId, yearMonth, next) {
  const i = state.reports.findIndex((r) => r.operatorId === operatorId && r.yearMonth === yearMonth);
  if (i >= 0) state.reports[i] = next; else state.reports.push(next);
  persist();
  return next;
}

const emptyReport = (operatorId, yearMonth) => ({
  operatorId, yearMonth, reviewState: 'none', currentVersion: 0, versions: [], threads: [], changeRequests: [],
});

const nowISO = () => new Date().toISOString();

/** Operator submits (or re-submits) a month. The last submit becomes the current version (FR-020).
 *  message：給縣府的留言（選填），會成為一則針對整份月報的任務。 */
export function submitReport(operatorId, yearMonth, fields, message, session) {
  const op = getOperator(operatorId);
  const cur = getReport(operatorId, yearMonth) ?? emptyReport(operatorId, yearMonth);
  const res = applyAction(cur, 'submit', session.role, ctxFor(operatorId, yearMonth, session));
  if (!res.ok) return res;
  let next = addVersion(res.report, fields, {
    now: nowISO(),
    serviceModes: Object.fromEntries(op.routes.map((r) => [r.routeNo, r.serviceModes])),
    savedBy: userName(session),
    savedByRole: 'operator',
  });
  if (message?.trim()) {
    const t = createThread(next, { text: message, author: op.name, role: 'operator', versionNo: next.currentVersion, now: nowISO(),
      ctx: { operatorId, ownOperatorId: session.operatorId }, names: mentionPeople(operatorId).map((x) => x.name) });
    if (t.ok) next = t.report;
  }
  return { ok: true, report: saveReport(operatorId, yearMonth, next) };
}

/** 縣府直接修改已送出的資料：存成新版本、記錄儲存者，狀態不變。 */
export function saveAsCounty(operatorId, yearMonth, fields, session) {
  if (!can(session.role, 'editData')) return { ok: false, error: 'not allowed' };
  const op = getOperator(operatorId);
  const cur = getReport(operatorId, yearMonth);
  if (!op || !cur?.versions?.length) return { ok: false, error: '尚未送出資料，沒有可修改的內容' };
  const next = addVersion(cur, fields, {
    now: nowISO(),
    serviceModes: Object.fromEntries(op.routes.map((r) => [r.routeNo, r.serviceModes])),
    savedBy: userName(session),
    savedByRole: 'county',
  });
  return { ok: true, report: saveReport(operatorId, yearMonth, next) };
}

/** 版本的儲存者；舊資料沒有記錄時視為業者送出。 */
export function versionSaver(version, operator) {
  return version?.savedBy ?? operator?.name ?? '';
}

/**
 * County review actions: markNeedsUpdate / markCompleted / reopen / reject / approve.
 * note：給業者的說明（選填），會成為一則針對整份月報的任務。
 * 退回「待更新」需要理由：填了說明，或已有縣府開的未解決任務都算。
 * opts.resolveOpen：檢核完成時一併把未解決任務標為已解決。
 */
export function reviewAction(operatorId, yearMonth, action, note, session, opts = {}) {
  const cur = getReport(operatorId, yearMonth);
  const hasReason = Boolean(note?.trim()) || openThreads(cur).some((t) => t.messages[0]?.role === 'county');
  const res = applyAction(cur, action, session.role, ctxFor(operatorId, yearMonth, session, { note: hasReason ? 'ok' : '' }));
  if (!res.ok) return res;
  let next = { ...res.report, changeRequests: (res.report.changeRequests ?? []).map((c) => ({ ...c })) };
  const by = { author: userName(session), role: session.role, now: nowISO() };
  if (note?.trim()) {
    const t = createThread(next, { ...by, text: note, versionNo: next.currentVersion, names: mentionPeople(operatorId).map((x) => x.name) });
    if (t.ok) next = t.report;
  }
  if (opts.resolveOpen) next = resolveAll(next, by);
  if (['reopen', 'reject', 'approve'].includes(action)) {
    const pending = next.changeRequests.find((c) => c.outcome === 'pending');
    if (pending) {
      pending.outcome = { reopen: 'reopened', reject: 'rejected', approve: 'approved' }[action];
      pending.decidedAt = nowISO();
      // 駁回：變更的版本留在版本紀錄，現行版本回到申請前的版本
      if (action === 'reject' && pending.baseVersion) next.currentVersion = pending.baseVersion;
    }
  }
  return { ok: true, report: saveReport(operatorId, yearMonth, next) };
}

/**
 * 業者對已完成月份直接修改後送出（FR-018）：存成新版本、狀態改為「申請變更」，等縣府駁回／退回／同意。
 * 申請變更中再修改：再存一版，沿用同一筆申請（原版本不變）。
 */
export function requestChange(operatorId, yearMonth, fields, reason, session) {
  const op = getOperator(operatorId);
  const cur = getReport(operatorId, yearMonth);
  const res = applyAction(cur, 'requestChange', session.role, ctxFor(operatorId, yearMonth, session, { reason }));
  if (!res.ok) return res;
  const baseVersion = cur.currentVersion;
  let next = addVersion(res.report, fields, {
    now: nowISO(),
    serviceModes: Object.fromEntries(op.routes.map((r) => [r.routeNo, r.serviceModes])),
    savedBy: userName(session),
    savedByRole: 'operator',
  });
  const list = (next.changeRequests ?? []).map((c) => ({ ...c }));
  const pending = list.find((c) => c.outcome === 'pending');
  if (pending) Object.assign(pending, { reason: reason.trim(), versionNo: next.currentVersion, updatedAt: nowISO() });
  else list.push({ reason: reason.trim(), requestedAt: nowISO(), outcome: 'pending', decidedAt: null, baseVersion, versionNo: next.currentVersion });
  next = { ...next, changeRequests: list };
  return { ok: true, report: saveReport(operatorId, yearMonth, next) };
}

// ---- 票證資料（每月上傳檔案；幸福巴士暫不納入） ----
export const getTicketUploads = () => state.ticketUploads ?? [];

/**
 * 業者上傳票證資料檔案（可一次多個檔案，算同一次上傳）。原型只記錄檔名、大小、資料筆數，不保存檔案內容。
 * files：[{ fileName, size, rows }]；紀錄上的 fileName／size／rows 是整批的合計，舊畫面照樣能用。
 */
export function addTicketUpload(operatorId, month, { files, note }, session) {
  if (!can(session.role, 'uploadTicket', { operatorId, ownOperatorId: session.operatorId })) return { ok: false, error: 'not allowed' };
  if (!needsTicket(getOperator(operatorId))) return { ok: false, error: '幸福巴士暫不需提供票證資料' };
  if (!files?.length) return { ok: false, error: 'no files' };
  if (files.some((f) => !isTicketFile(f.fileName))) return { ok: false, error: '只接受 CSV 或 Excel 檔案' };
  const m = mergeFiles(files);
  const fileName = m.files.length > 1 ? `${m.files[0].fileName} 等 ${m.files.length} 個檔案` : m.files[0].fileName;
  const rec = { operatorId, month, fileName, size: m.size, rows: m.rows, files: m.files, note: note?.trim() || '', uploadedAt: nowISO(), uploadedBy: userName(session) };
  state.ticketUploads = [...getTicketUploads(), rec];
  persist();
  return { ok: true, upload: rec };
}

// ---- 任務留言板 ----
const threadCtx = (operatorId, session) => ({ operatorId, ownOperatorId: session.operatorId });

const namesFor = (operatorId) => mentionPeople(operatorId).map((x) => x.name);

/** 新增任務。anchor：{ path } 或 null（整份月報）；attachments：附件與連結。 */
export function addThread(operatorId, yearMonth, { anchor, text, attachments = [] }, session) {
  const cur = getReport(operatorId, yearMonth);
  const res = createThread(cur, { anchor, text, attachments, author: userName(session), role: session.role, versionNo: cur?.currentVersion ?? null,
    now: nowISO(), ctx: threadCtx(operatorId, session), names: namesFor(operatorId) });
  if (!res.ok) return res;
  saveReport(operatorId, yearMonth, res.report);
  return res;
}

/** 回覆任務。replyTo：針對串裡某一則留言回覆。 */
export function replyToThread(operatorId, yearMonth, threadId, { text, attachments = [], replyTo = null }, session) {
  const res = replyThread(getReport(operatorId, yearMonth), threadId, { text, attachments, replyTo, author: userName(session), role: session.role,
    now: nowISO(), ctx: threadCtx(operatorId, session), names: namesFor(operatorId) });
  if (!res.ok) return res;
  saveReport(operatorId, yearMonth, res.report);
  return res;
}

/** 表情符號回應（再按一次取消）。 */
export function reactToMessage(operatorId, yearMonth, threadId, messageId, emoji, session) {
  const res = toggleReaction(getReport(operatorId, yearMonth), threadId, messageId, emoji, { user: userName(session), role: session.role,
    ctx: threadCtx(operatorId, session) });
  if (!res.ok) return res;
  saveReport(operatorId, yearMonth, res.report);
  return res;
}

/** 縣府把任務標為已解決（'resolved'）或重新開啟（'open'）。 */
export function setThreadState(operatorId, yearMonth, threadId, status, session) {
  const res = setThreadStatus(getReport(operatorId, yearMonth), threadId, status, { author: userName(session), role: session.role, now: nowISO() });
  if (!res.ok) return res;
  saveReport(operatorId, yearMonth, res.report);
  return res;
}

/** 某業者各月份中，業者與縣府最新的一則留言（月報總覽兩欄）。 */
export function latestComments(operatorId) {
  let operator = null; let county = null;
  for (const r of state.reports) {
    if (r.operatorId !== operatorId) continue;
    const o = latestComment(r, 'operator');
    const c = latestComment(r, 'county');
    if (o && (!operator || o.at > operator.at)) operator = { ...o, yearMonth: r.yearMonth };
    if (c && (!county || c.at > county.at)) county = { ...c, yearMonth: r.yearMonth };
  }
  return { operator, county };
}
