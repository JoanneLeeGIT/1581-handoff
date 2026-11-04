import test from 'node:test';
import assert from 'node:assert/strict';
import { can, ROLES, canChangeServiceMode } from '../js/permissions.js';

test('only three roles exist', () => {
  assert.deepEqual([...ROLES].sort(), ['county', 'operator', 'readonly']);
  assert.throws(() => can('admin', 'view'));
});

test('county can review, handle change requests, export, comment and resolve threads', () => {
  for (const a of ['view', 'export', 'markNeedsUpdate', 'markCompleted', 'reopen', 'reject', 'approve', 'comment', 'resolveThread']) {
    assert.equal(can('county', a), true, a);
  }
  for (const a of ['submit', 'requestChange', 'uploadTicket']) assert.equal(can('county', a), false, a);
});

test('only county can edit submitted data', () => {
  assert.equal(can('county', 'editData'), true);
  assert.equal(can('readonly', 'editData'), false);
  assert.equal(can('operator', 'editData', { operatorId: 'a', ownOperatorId: 'a' }), false);
});

test('readonly can only view and export', () => {
  assert.equal(can('readonly', 'view'), true);
  assert.equal(can('readonly', 'export'), true);
  for (const a of ['submit', 'markCompleted', 'markNeedsUpdate', 'reopen', 'reject', 'approve', 'requestChange', 'comment', 'resolveThread', 'uploadTicket']) {
    assert.equal(can('readonly', a), false, a);
  }
});

test('operator can only act on its own operatorId', () => {
  const own = { operatorId: 'a', ownOperatorId: 'a' };
  const other = { operatorId: 'b', ownOperatorId: 'a' };
  for (const a of ['view', 'submit', 'requestChange', 'comment', 'uploadTicket']) {
    assert.equal(can('operator', a, own), true, a);
    assert.equal(can('operator', a, other), false, a);
  }
  assert.equal(can('operator', 'submit'), false, 'no context means no access');
});

test('operator cannot review or export', () => {
  const own = { operatorId: 'a', ownOperatorId: 'a' };
  for (const a of ['markCompleted', 'markNeedsUpdate', 'reopen', 'reject', 'approve', 'export', 'resolveThread']) {
    assert.equal(can('operator', a, own), false, a);
  }
});

test('operators and read-only users can never change a route service mode', () => {
  assert.equal(canChangeServiceMode('operator'), false);
  assert.equal(canChangeServiceMode('readonly'), false);
  assert.throws(() => canChangeServiceMode('admin'));
});
