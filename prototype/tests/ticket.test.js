import test from 'node:test';
import assert from 'node:assert/strict';
import { dueMonth, dueWindow, publishMonth, getTicketStatus, availableFrom, canUploadNow, isLate, countDataRows, uploadsFor, monthLabel, needsTicket } from '../js/ticket.js';

test('每月資料於下個月 1–15 日上傳：10 月 → 11 月、12 月 → 隔年 1 月', () => {
  assert.deepEqual(dueMonth('2026-10'), { year: 2026, month: 11 });
  assert.deepEqual(dueMonth('2026-12'), { year: 2027, month: 1 });
  assert.deepEqual(dueWindow('2026-10'), { from: '2026-11-01', to: '2026-11-15' });
  assert.equal(monthLabel('2026-10'), '2026 年 10 月');
});

test('每季上架於 2、5、8、11 月底（Q1 → 5 月、Q3 → 11 月、Q4 → 隔年 2 月）', () => {
  for (const m of ['01', '02', '03']) assert.deepEqual(publishMonth(`2026-${m}`), { year: 2026, month: 5 });
  for (const m of ['07', '08', '09']) assert.deepEqual(publishMonth(`2026-${m}`), { year: 2026, month: 11 });
  for (const m of ['10', '11', '12']) assert.deepEqual(publishMonth(`2026-${m}`), { year: 2027, month: 2 });
});

test('狀態：下個月 1–15 日開放、16 日起逾期，有上傳即完成', () => {
  assert.equal(getTicketStatus([], '2026-10', '2026-10-31'), 'notStarted');
  assert.equal(getTicketStatus([], '2026-10', '2026-11-01'), 'open');
  assert.equal(getTicketStatus([], '2026-10', '2026-11-15'), 'open');
  assert.equal(getTicketStatus([], '2026-10', '2026-11-16'), 'overdue');
  assert.equal(getTicketStatus([{}], '2026-10', '2026-12-20'), 'completed');
  assert.equal(getTicketStatus([], '2026-12', '2027-01-16'), 'overdue');
});

test('該月結束後即可上傳', () => {
  assert.equal(availableFrom('2026-10'), '2026-11-01');
  assert.equal(availableFrom('2026-12'), '2027-01-01');
  assert.equal(canUploadNow('2026-10', '2026-10-31'), false);
  assert.equal(canUploadNow('2026-10', '2026-11-01'), true);
});

test('逾期上傳用台灣日期判斷', () => {
  assert.equal(isLate({ uploadedAt: '2026-11-15T23:30:00+08:00' }, '2026-10'), false);
  assert.equal(isLate({ uploadedAt: '2026-11-15T16:30:00Z' }, '2026-10'), true); // 台灣 11/16 00:30
});

test('幸福巴士暫不納入票證資料', () => {
  assert.equal(needsTicket({ type: 'urban' }), true);
  assert.equal(needsTicket({ type: 'happybus', happybusVersion: '1.0' }), false);
  assert.equal(needsTicket({ type: 'happybus', happybusVersion: '2.0' }), false);
  assert.equal(needsTicket(null), false);
});

test('row count skips blank rows and the header', () => {
  assert.equal(countDataRows([['卡號', '日期'], ['1', 'a'], [], ['', ' '], ['2', 'b']]), 2);
  assert.equal(countDataRows([['卡號']]), 0);
  assert.equal(countDataRows([]), 0);
});

test('uploads are filtered by operator and month, newest first', () => {
  const list = [
    { operatorId: 'a', month: '2026-10', uploadedAt: '2026-11-01T10:00:00+08:00' },
    { operatorId: 'a', month: '2026-10', uploadedAt: '2026-11-03T10:00:00+08:00' },
    { operatorId: 'a', month: '2026-09', uploadedAt: '2026-10-04T10:00:00+08:00' },
    { operatorId: 'b', month: '2026-10', uploadedAt: '2026-11-02T10:00:00+08:00' },
  ];
  assert.deepEqual(uploadsFor(list, 'a', '2026-10').map((u) => u.uploadedAt.slice(8, 10)), ['03', '01']);
});

test('only Excel / CSV files are accepted', async () => {
  const { isTicketFile } = await import('../js/ticket.js');
  for (const n of ['a.csv', 'B.XLSX', '票證.xls']) assert.equal(isTicketFile(n), true, n);
  for (const n of ['a.pdf', 'a.png', 'a.jpg', 'a.docx', 'csv', 'a.csv.pdf', '', undefined]) assert.equal(isTicketFile(n), false, String(n));
});

test('multi-file upload: totals, dedupe by name, old single-file records', async () => {
  const { mergeFiles, uploadFiles } = await import('../js/ticket.js');
  const m = mergeFiles([{ fileName: 'a.csv', size: 10, rows: 3 }, { fileName: 'b.xlsx', size: 5, rows: 2 }, { fileName: 'a.csv', size: 12, rows: 4 }]);
  assert.deepEqual(m.files.map((f) => f.fileName), ['a.csv', 'b.xlsx']);
  assert.equal(m.rows, 6); assert.equal(m.size, 17);
  assert.deepEqual(uploadFiles({ fileName: 'x.csv', size: 1, rows: 1 }), [{ fileName: 'x.csv', size: 1, rows: 1 }]);
  assert.equal(uploadFiles({ files: [{ fileName: 'a' }, { fileName: 'b' }] }).length, 2);
});
