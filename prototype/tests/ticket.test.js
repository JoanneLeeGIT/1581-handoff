import test from 'node:test';
import assert from 'node:assert/strict';
import { dueMonth, dueWindow, getTicketStatus, availableFrom, canUploadNow, isLate, countDataRows, uploadsFor, quarterLabel } from '../js/ticket.js';

test('due month is the month after the quarter: Q1→Apr, Q2→Jul, Q3→Oct, Q4→next Jan', () => {
  assert.deepEqual(dueMonth('2026-Q1'), { year: 2026, month: 4 });
  assert.deepEqual(dueMonth('2026-Q2'), { year: 2026, month: 7 });
  assert.deepEqual(dueMonth('2026-Q3'), { year: 2026, month: 10 });
  assert.deepEqual(dueMonth('2026-Q4'), { year: 2027, month: 1 });
  assert.deepEqual(dueWindow('2026-Q3'), { from: '2026-10-01', to: '2026-10-15' });
  assert.equal(quarterLabel('2026-Q3'), '2026 年第 3 季（7–9 月）');
});

test('status: 1–15 open, 16th overdue, any upload completes', () => {
  assert.equal(getTicketStatus([], '2026-Q3', '2026-09-30'), 'notStarted');
  assert.equal(getTicketStatus([], '2026-Q3', '2026-10-01'), 'open');
  assert.equal(getTicketStatus([], '2026-Q3', '2026-10-15'), 'open');
  assert.equal(getTicketStatus([], '2026-Q3', '2026-10-16'), 'overdue');
  assert.equal(getTicketStatus([{}], '2026-Q3', '2026-11-20'), 'completed');
  assert.equal(getTicketStatus([], '2026-Q4', '2027-01-16'), 'overdue');
});

test('upload is possible once the quarter has ended', () => {
  assert.equal(availableFrom('2026-Q3'), '2026-10-01');
  assert.equal(availableFrom('2026-Q4'), '2027-01-01');
  assert.equal(canUploadNow('2026-Q3', '2026-09-30'), false);
  assert.equal(canUploadNow('2026-Q3', '2026-10-01'), true);
});

test('late upload uses Taiwan date', () => {
  assert.equal(isLate({ uploadedAt: '2026-10-15T23:30:00+08:00' }, '2026-Q3'), false);
  assert.equal(isLate({ uploadedAt: '2026-10-15T16:30:00Z' }, '2026-Q3'), true); // 台灣 10/16 00:30
});

test('row count skips blank rows and the header', () => {
  assert.equal(countDataRows([['卡號', '日期'], ['1', 'a'], [], ['', ' '], ['2', 'b']]), 2);
  assert.equal(countDataRows([['卡號']]), 0);
  assert.equal(countDataRows([]), 0);
});

test('uploads are filtered by operator and quarter, newest first', () => {
  const list = [
    { operatorId: 'a', quarter: '2026-Q3', uploadedAt: '2026-11-01T10:00:00+08:00' },
    { operatorId: 'a', quarter: '2026-Q3', uploadedAt: '2026-11-03T10:00:00+08:00' },
    { operatorId: 'b', quarter: '2026-Q3', uploadedAt: '2026-11-02T10:00:00+08:00' },
  ];
  assert.deepEqual(uploadsFor(list, 'a', '2026-Q3').map((u) => u.uploadedAt.slice(8, 10)), ['03', '01']);
});
