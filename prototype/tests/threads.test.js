import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createThread, replyThread, setThreadStatus, resolveAll, openThreads, resolvedThreads, latestComment, migrateNotes, canComment,
  parseMentions, toggleReaction, threadsMentioning,
} from '../js/threads.js';

const own = { operatorId: 'a', ownOperatorId: 'a' };
const base = { operatorId: 'a', yearMonth: '2026-10', reviewState: 'reviewing', threads: [] };
const T1 = '2026-10-12T10:00:00+08:00';
const T2 = '2026-10-13T10:00:00+08:00';
const county = { author: 'LinLin（縣府）', role: 'county' };
const op = { author: '示範客運', role: 'operator', ctx: own };

test('county and the own operator can comment; readonly and other operators cannot', () => {
  assert.equal(canComment('county'), true);
  assert.equal(canComment('operator', own), true);
  assert.equal(canComment('operator', { operatorId: 'b', ownOperatorId: 'a' }), false);
  assert.equal(canComment('readonly'), false);
  assert.equal(createThread(base, { text: 'x', role: 'readonly', author: 'r', now: T1 }).ok, false);
});

test('create a thread anchored to a cell, then reply', () => {
  const a = createThread(base, { ...county, anchor: { path: 'routes.R1.fixed.passengers' }, text: ' 請確認 ', versionNo: 2, now: T1 });
  assert.equal(a.ok, true);
  assert.equal(a.thread.status, 'open');
  assert.deepEqual(a.thread.anchor, { path: 'routes.R1.fixed.passengers' });
  assert.equal(a.thread.messages[0].text, '請確認');
  assert.equal(a.thread.versionNo, 2);
  assert.equal(base.threads.length, 0, 'input not mutated');

  const b = replyThread(a.report, a.thread.id, { ...op, text: '已更正', now: T2 });
  assert.equal(b.ok, true);
  assert.equal(b.thread.messages.length, 2);
  assert.equal(b.thread.messages[1].role, 'operator');
});

test('empty text is rejected', () => {
  assert.equal(createThread(base, { ...county, text: '  ', now: T1 }).error, 'empty');
});

test('only county resolves; resolved threads are archived and can be reopened', () => {
  const a = createThread(base, { ...county, text: '請確認', now: T1 });
  assert.equal(setThreadStatus(a.report, a.thread.id, 'resolved', { ...op, now: T2 }).ok, false);
  const r = setThreadStatus(a.report, a.thread.id, 'resolved', { ...county, now: T2 });
  assert.equal(r.ok, true);
  assert.equal(openThreads(r.report).length, 0);
  assert.equal(resolvedThreads(r.report).length, 1);
  assert.equal(r.thread.resolvedBy, county.author);
  assert.equal(r.thread.messages.at(-1).kind, 'resolved');
  assert.equal(replyThread(r.report, a.thread.id, { ...op, text: '還有問題', now: T2 }).error, 'resolved');

  const o = setThreadStatus(r.report, a.thread.id, 'open', { ...county, now: T2 });
  assert.equal(o.ok, true);
  assert.equal(o.thread.resolvedAt, null);
  assert.equal(o.thread.messages.at(-1).kind, 'reopened');
});

test('resolveAll closes every open thread', () => {
  let rep = createThread(base, { ...county, text: 'a', now: T1 }).report;
  rep = createThread(rep, { ...op, text: 'b', now: T1 }).report;
  assert.equal(openThreads(resolveAll(rep, { ...county, now: T2 })).length, 0);
});

test('latestComment picks the newest comment of a role', () => {
  let rep = createThread(base, { ...county, text: 'old', now: T1 }).report;
  rep = createThread(rep, { ...county, text: 'new', now: T2 }).report;
  assert.equal(latestComment(rep, 'county').text, 'new');
  assert.equal(latestComment(rep, 'operator'), null);
});

test('old file / review notes migrate to general threads', () => {
  const old = { reviewState: 'completed', fileNotes: [{ text: 'f', author: 'op', at: T1 }], reviewNotes: [{ text: 'r', author: 'cty', at: T2 }] };
  const m = migrateNotes(old, { countyName: 'LinLin' });
  assert.equal(m.fileNotes, undefined);
  assert.equal(m.threads.length, 2);
  assert.deepEqual(m.threads.map((t) => t.messages[0].role), ['operator', 'county']);
  assert.ok(m.threads.every((t) => t.status === 'resolved' && t.anchor === null));
  assert.equal(migrateNotes(m, { countyName: 'x' }), m, 'already migrated → unchanged');
});

test('mentions only match known names, longest first', () => {
  assert.deepEqual(parseMentions('@LinLin 請看 @示範山海客運 和 @路人', ['LinLin', '示範山海客運', '示範山海']), ['LinLin', '示範山海客運']);
  const a = createThread(base, { ...county, text: '@示範客運 請確認', now: T1, names: ['示範客運'] });
  assert.deepEqual(a.thread.messages[0].mentions, ['示範客運']);
  assert.equal(threadsMentioning(a.report, '示範客運').length, 1);
  assert.equal(threadsMentioning(a.report, 'LinLin').length, 0);
});

test('attachments alone are enough; reply can target a message', () => {
  const file = { kind: 'link', name: '雲端資料夾', url: 'https://example.com/x' };
  const a = createThread(base, { ...op, text: '', attachments: [file], now: T1 });
  assert.equal(a.ok, true);
  assert.deepEqual(a.thread.messages[0].attachments, [file]);
  const first = a.thread.messages[0].id;
  const b = replyThread(a.report, a.thread.id, { ...county, text: '收到', replyTo: first, now: T2 });
  assert.equal(b.thread.messages[1].replyTo, first);
  const c = replyThread(a.report, a.thread.id, { ...county, text: '收到', replyTo: 'nope', now: T2 });
  assert.equal(c.thread.messages[1].replyTo, null, 'unknown target ignored');
});

test('reactions toggle per user; readonly cannot react', () => {
  const a = createThread(base, { ...county, text: '請確認', now: T1 });
  const mid = a.thread.messages[0].id;
  const r1 = toggleReaction(a.report, a.thread.id, mid, '👍', { user: 'X', role: 'operator', ctx: own });
  assert.deepEqual(r1.thread.messages[0].reactions, { '👍': ['X'] });
  const r2 = toggleReaction(r1.report, a.thread.id, mid, '👍', { user: 'X', role: 'operator', ctx: own });
  assert.deepEqual(r2.thread.messages[0].reactions, {});
  assert.equal(toggleReaction(a.report, a.thread.id, mid, '👍', { user: 'R', role: 'readonly' }).ok, false);
  assert.equal(toggleReaction(a.report, a.thread.id, mid, '💩', { user: 'X', role: 'county' }).ok, false);
});
