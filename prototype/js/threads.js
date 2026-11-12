// 任務留言板（取代原本的檔案備註／檢核備註）：純函式，不碰畫面與儲存。
// 一則「任務」＝標在表格某一格／某一列（或整份月報）的一串留言。縣府可標為已解決（封存），之後也能重新開啟。
//
// thread = {
//   id, anchor: { path } | null,         // path 例：routes.U2-01.fixed.passengers、routeNotes.U2-01、routes.U2-01（整列）、charter.passengers
//   status: 'open' | 'resolved',
//   versionNo,                            // 建立時看的是第幾版
//   createdAt, resolvedAt, resolvedBy,
//   messages: [{ id, kind: 'comment' | 'resolved' | 'reopened', text, author, role, at,
//                mentions: [名稱], attachments: [{ kind: 'file'|'link', name, type, size, url }],
//                reactions: { '👍': [使用者名稱] }, replyTo: 被回覆的留言 id | null }]
// }
// text 為純文字（不支援粗體、斜體等格式）；網址自動成連結，@名稱會標色。

import { can } from './permissions.js';

const ROLE_OF = { county: 'county', operator: 'operator' };

export const REACTIONS = ['👍', '❤️', '✅', '👀', '🎉'];

let seq = 0;
const newId = (prefix, now) => `${prefix}${Date.parse(now) || Date.now()}${(seq += 1)}`;

export const threadsOf = (report) => report?.threads ?? [];
export const openThreads = (report) => threadsOf(report).filter((t) => t.status === 'open');
export const resolvedThreads = (report) => threadsOf(report).filter((t) => t.status === 'resolved');
export const comments = (thread) => thread.messages.filter((m) => m.kind === 'comment');

/** 誰能留言：縣府、該業者本人。唯讀單位只能看。 */
export function canComment(role, ctx = {}) {
  return can(role, 'comment', ctx);
}

/** 只有縣府能把任務標為已解決或重新開啟。 */
export const canResolve = (role) => can(role, 'resolveThread');

/** 從文字找出被 @ 的對象（只認得 names 裡的名稱，長的名稱優先比對）。 */
export function parseMentions(text, names = []) {
  const found = new Set();
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const body = String(text ?? '');
  for (let i = body.indexOf('@'); i >= 0; i = body.indexOf('@', i + 1)) {
    const hit = sorted.find((n) => body.startsWith(n, i + 1));
    if (hit) found.add(hit);
  }
  return [...found];
}

function newMessage({ text, author, role, now, attachments = [], replyTo = null, names = [] }) {
  return {
    id: newId('m', now), kind: 'comment', text, author, role: ROLE_OF[role], at: now,
    mentions: parseMentions(text, names), attachments: attachments.map((a) => ({ ...a })), reactions: {}, replyTo,
  };
}

/** 內容檢查：文字或附件至少要有一樣。 */
const isEmpty = (text, attachments) => !String(text ?? '').trim() && !(attachments?.length);

function withThreads(report, threads) {
  return { ...report, threads };
}

/** 新增一則任務。anchor 為 null 表示針對整份月報。 */
export function createThread(report, { anchor = null, text, author, role, versionNo = null, now, ctx = {}, attachments = [], names = [] }) {
  if (!report) return { ok: false, error: 'no report' };
  if (!canComment(role, ctx)) return { ok: false, error: 'not allowed' };
  if (isEmpty(text, attachments)) return { ok: false, error: 'empty' };
  const body = String(text ?? '').trim();
  const thread = {
    id: newId('t', now),
    anchor: anchor?.path ? { path: anchor.path } : null,
    status: 'open',
    versionNo,
    createdAt: now,
    resolvedAt: null,
    resolvedBy: null,
    messages: [newMessage({ text: body, author, role, now, attachments, names })],
  };
  return { ok: true, thread, report: withThreads(report, [...threadsOf(report), thread]) };
}

function updateThread(report, threadId, fn) {
  const list = threadsOf(report);
  const i = list.findIndex((t) => t.id === threadId);
  if (i < 0) return { ok: false, error: 'no thread' };
  const next = fn(list[i]);
  if (next.ok === false) return next;
  const threads = list.map((t, j) => (j === i ? next : t));
  return { ok: true, thread: next, report: withThreads(report, threads) };
}

/** 回覆。replyTo＝針對串裡的某一則留言回覆。已解決的任務不能回覆（要先重新開啟）。 */
export function replyThread(report, threadId, { text, author, role, now, ctx = {}, attachments = [], replyTo = null, names = [] }) {
  if (!canComment(role, ctx)) return { ok: false, error: 'not allowed' };
  if (isEmpty(text, attachments)) return { ok: false, error: 'empty' };
  return updateThread(report, threadId, (t) => {
    if (t.status === 'resolved') return { ok: false, error: 'resolved' };
    const target = replyTo && t.messages.some((m) => m.id === replyTo) ? replyTo : null;
    return { ...t, messages: [...t.messages, newMessage({ text: String(text ?? '').trim(), author, role, now, attachments, replyTo: target, names })] };
  });
}

/** 表情符號回應：同一人再按一次就取消。 */
export function toggleReaction(report, threadId, messageId, emoji, { user, role, ctx = {} }) {
  if (!canComment(role, ctx)) return { ok: false, error: 'not allowed' };
  if (!REACTIONS.includes(emoji)) return { ok: false, error: 'bad emoji' };
  return updateThread(report, threadId, (t) => {
    const i = t.messages.findIndex((m) => m.id === messageId && m.kind === 'comment');
    if (i < 0) return { ok: false, error: 'no message' };
    const m = t.messages[i];
    const who = m.reactions?.[emoji] ?? [];
    const nextWho = who.includes(user) ? who.filter((u) => u !== user) : [...who, user];
    const reactions = { ...(m.reactions ?? {}), [emoji]: nextWho };
    if (!nextWho.length) delete reactions[emoji];
    return { ...t, messages: t.messages.map((x, j) => (j === i ? { ...m, reactions } : x)) };
  });
}

/** 有提到某人的任務（「提及我」分頁）。 */
export const threadsMentioning = (report, name) =>
  threadsOf(report).filter((t) => comments(t).some((m) => m.mentions?.includes(name)));

/** 標為已解決（status='resolved'）或重新開啟（status='open'）。會在留言串留下一筆紀錄。 */
export function setThreadStatus(report, threadId, status, { author, role, now }) {
  if (!canResolve(role)) return { ok: false, error: 'not allowed' };
  if (!['open', 'resolved'].includes(status)) return { ok: false, error: `bad status: ${status}` };
  return updateThread(report, threadId, (t) => {
    if (t.status === status) return { ok: false, error: `already ${status}` };
    const kind = status === 'resolved' ? 'resolved' : 'reopened';
    return {
      ...t,
      status,
      resolvedAt: status === 'resolved' ? now : null,
      resolvedBy: status === 'resolved' ? author : null,
      messages: [...t.messages, { id: newId('m', now), kind, text: '', author, role: ROLE_OF[role], at: now }],
    };
  });
}

/** 一次把所有未解決任務標為已解決（縣府「檢核完成」時可選）。 */
export function resolveAll(report, by) {
  let cur = report;
  for (const t of openThreads(report)) {
    const res = setThreadStatus(cur, t.id, 'resolved', by);
    if (res.ok) cur = res.report;
  }
  return cur;
}

/** 某角色在這份月報最新的一則留言（月報總覽用）。 */
export function latestComment(report, role) {
  let best = null;
  for (const t of threadsOf(report)) {
    for (const m of comments(t)) if (m.role === role && (!best || m.at > best.at)) best = { ...m, threadId: t.id, threadStatus: t.status };
  }
  return best;
}

/** 舊資料（fileNotes／reviewNotes）轉成任務：每則備註一串、針對整份月報；已完成的月份視為已解決。 */
export function migrateNotes(report, { countyName }) {
  if (!report || report.threads) return report;
  const done = report.reviewState === 'completed';
  const toThread = (n, role, i) => ({
    id: `legacy-${role}-${i}-${Date.parse(n.at) || i}`,
    anchor: null,
    status: done ? 'resolved' : 'open',
    versionNo: null,
    createdAt: n.at,
    resolvedAt: done ? n.at : null,
    resolvedBy: done ? countyName : null,
    messages: [{ id: `legacy-m-${role}-${i}`, kind: 'comment', text: n.text, author: n.author, role, at: n.at }],
  });
  const threads = [
    ...(report.fileNotes ?? []).map((n, i) => toThread(n, 'operator', i)),
    ...(report.reviewNotes ?? []).map((n, i) => toThread(n, 'county', i)),
  ].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const { fileNotes, reviewNotes, ...rest } = report;
  return { ...rest, threads };
}
