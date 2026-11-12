import test from 'node:test';
import assert from 'node:assert/strict';
import { getStatus, applyAction, STATUS } from '../js/status.js';

const OP = 'op_a';
const ctx = (extra = {}) => ({ operatorId: OP, ownOperatorId: OP, ...extra });

test('依資料月份：10 月資料 11/1–11/15 開放填報，16 日起逾期；當月還沒結束＝未開始', () => {
  assert.equal(getStatus(null, '2026-11', '2026-11-20'), 'notStarted');
  assert.equal(getStatus(null, '2026-10', '2026-10-31'), 'notStarted');
  assert.equal(getStatus(null, '2026-10', '2026-11-01'), 'open');
  assert.equal(getStatus(null, '2026-10', '2026-11-15'), 'open');
  assert.equal(getStatus(null, '2026-10', '2026-11-16'), 'overdue');
  assert.equal(getStatus(null, '2026-12', '2027-01-15'), 'open'); // 跨年
  assert.equal(getStatus({ reviewState: 'none' }, '2026-09', '2026-11-03'), 'overdue');
});

test('營運月報與票證資料共用同一份時程設定', async () => {
  const { SCHEDULE, submitWindow } = await import('../js/schedule.js');
  const { dueWindow } = await import('../js/ticket.js');
  assert.deepEqual(SCHEDULE.report, SCHEDULE.ticket);
  assert.deepEqual(submitWindow('report', '2026-10'), { from: '2026-11-01', to: '2026-11-15' });
  assert.deepEqual(dueWindow('2026-10'), submitWindow('report', '2026-10'));
});

test('stored review states map to themselves', () => {
  for (const s of ['reviewing', 'needsUpdate', 'completed', 'changeRequested']) {
    assert.equal(getStatus({ reviewState: s }, '2026-10', '2026-11-03'), s);
  }
  assert.equal(Object.keys(STATUS).length, 7);
});

test('invalid reviewState is rejected', () => {
  assert.throws(() => getStatus({ reviewState: 'bogus' }, '2026-10', '2026-11-03'));
});

test('operator submit: open/overdue/needsUpdate/reviewing -> reviewing', () => {
  for (const [rs, today] of [['none', '2026-11-05'], ['none', '2026-11-20'], ['needsUpdate', '2026-11-20'], ['reviewing', '2026-11-20']]) {
    const r = applyAction({ reviewState: rs }, 'submit', 'operator', ctx({ yearMonth: '2026-10', today }));
    assert.equal(r.ok, true, `${rs} ${today}`);
    assert.equal(r.report.reviewState, 'reviewing');
  }
});

test('cannot submit for a future month or a completed month', () => {
  assert.equal(applyAction(null, 'submit', 'operator', ctx({ yearMonth: '2026-11', today: '2026-11-03' })).ok, false);
  assert.equal(applyAction({ reviewState: 'completed' }, 'submit', 'operator', ctx({ yearMonth: '2026-10', today: '2026-11-03' })).ok, false);
});

test('county review transitions', () => {
  const c = { yearMonth: '2026-10', today: '2026-11-03', operatorId: OP };
  assert.equal(applyAction({ reviewState: 'reviewing' }, 'markCompleted', 'county', c).report.reviewState, 'completed');
  const nu = applyAction({ reviewState: 'reviewing' }, 'markNeedsUpdate', 'county', { ...c, note: '請補資料' });
  assert.equal(nu.report.reviewState, 'needsUpdate');
  // review note is mandatory when sending back
  assert.equal(applyAction({ reviewState: 'reviewing' }, 'markNeedsUpdate', 'county', { ...c, note: '  ' }).ok, false);
});

test('county cannot review a month that was never submitted', () => {
  const c = { yearMonth: '2026-10', today: '2026-11-03', operatorId: OP };
  assert.equal(applyAction(null, 'markCompleted', 'county', c).ok, false);
  assert.equal(applyAction({ reviewState: 'none' }, 'markNeedsUpdate', 'county', { ...c, note: 'x' }).ok, false);
});

test('change request flow', () => {
  const c = ctx({ yearMonth: '2026-10', today: '2026-11-03' });
  const req = applyAction({ reviewState: 'completed' }, 'requestChange', 'operator', { ...c, reason: '數字填錯' });
  assert.equal(req.report.reviewState, 'changeRequested');
  assert.equal(applyAction({ reviewState: 'completed' }, 'requestChange', 'operator', { ...c, reason: '' }).ok, false);
  assert.equal(applyAction({ reviewState: 'reviewing' }, 'requestChange', 'operator', { ...c, reason: 'x' }).ok, false);
  // 申請變更中，業者可再修改送出
  assert.equal(applyAction(req.report, 'requestChange', 'operator', { ...c, reason: '再改一次' }).report.reviewState, 'changeRequested');
  // 縣府：退回待更新／駁回維持已完成／同意更正
  assert.equal(applyAction(req.report, 'reopen', 'county', c).report.reviewState, 'needsUpdate');
  assert.equal(applyAction(req.report, 'reject', 'county', c).report.reviewState, 'completed');
  assert.equal(applyAction(req.report, 'approve', 'county', c).report.reviewState, 'completed');
  assert.equal(applyAction({ reviewState: 'completed' }, 'approve', 'county', c).ok, false);
});

test('roles are enforced', () => {
  const c = { yearMonth: '2026-10', today: '2026-11-03', operatorId: OP };
  assert.equal(applyAction({ reviewState: 'reviewing' }, 'markCompleted', 'readonly', c).ok, false);
  assert.equal(applyAction({ reviewState: 'reviewing' }, 'markCompleted', 'operator', ctx({ yearMonth: '2026-10', today: '2026-11-03' })).ok, false);
  assert.equal(applyAction(null, 'submit', 'operator', { yearMonth: '2026-11', today: '2026-11-05', operatorId: 'op_b', ownOperatorId: OP }).ok, false);
  assert.throws(() => applyAction(null, 'submit', 'admin', c));
});

test('applyAction does not mutate its input', () => {
  const before = { reviewState: 'reviewing' };
  applyAction(before, 'markCompleted', 'county', { yearMonth: '2026-10', today: '2026-11-03', operatorId: OP });
  assert.equal(before.reviewState, 'reviewing');
});
